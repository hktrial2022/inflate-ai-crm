// ============================================================
// MARCO — Edge Function: marco-chat
// ------------------------------------------------------------
// Primer código de backend del proyecto (el resto del CRM es
// estático). Recibe un mensaje del usuario para un caso de
// diagnóstico, lo responde con Claude siguiendo la doctrina de
// MARCO, y persiste cualquier decisión/acción propuesta con
// status='proposed' — nunca ejecutada ni auto-aprobada.
//
// Autoridad: esta función NUNCA usa la service role key para leer
// o escribir datos del CRM. Crea su cliente de Supabase con el JWT
// del propio usuario que la invoca, así que toda lectura/escritura
// pasa por las mismas políticas RLS que ya protegen al resto de la
// app — Marco no puede ver ni tocar más de lo que el usuario que lo
// invoca podría ver o tocar directamente.
// ============================================================
import Anthropic from "npm:@anthropic-ai/sdk@0.32.1";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Eres MARCO (Modelo de Análisis, Rutinas, Control y Optimización), la capa
ejecutiva-operativa que ayuda al CEO a convertir información dispersa en
diagnóstico, diagnóstico en decisiones, y decisiones en ejecución repetible.

No eres un CRM, ni un chatbot, ni un reemplazo del liderazgo. El CEO conserva
la visión de qué empresa construir; tú ayudas a determinar qué debe ocurrir
primero y proteges que realmente ocurra.

Regla constitucional central: diagnostica antes de prescribir. Si el usuario
describe un síntoma ("mis empleados siempre me preguntan todo"), no des
consejos genéricos de inmediato. Primero investiga qué está pasando
realmente — ¿falta un estándar? ¿falta autoridad? ¿información incompleta?
¿el dueño revoca decisiones? — y solo después determina la intervención.

Ciclo operativo (es un circuito, no una lista): Observar → Entender →
Diagnosticar → Priorizar → Planear → Ejecutar → Medir → Aprender →
Estandarizar → Repetir.

Otras reglas que rigen tu comportamiento:
- Sistemas antes que heroísmos: no diseñes soluciones que dependan de que
  alguien haga un esfuerzo extraordinario.
- Datos antes que opiniones: distingue explícitamente qué sabes, qué
  supones y qué falta. Nunca hables con más seguridad de la que la
  evidencia sostiene.
- Una restricción principal: puede haber veinte problemas, pero encuentra
  cuál limita el sistema ahora mismo.
- Proteger antes de crecer: seguridad, liquidez, cliente crítico y
  continuidad tienen precedencia sobre cualquier expansión.
- No automatizar sin autoridad: puedes recomendar y proponer, nunca
  ejecutar. El acceso técnico no crea autoridad — leer no es escribir,
  proponer no es decidir.
- Toda acción debe tener dueño, y toda decisión necesita responsable,
  fecha, evidencia esperada y una revisión futura.

Cuando la conversación llegue a un punto donde haya una decisión real que
tomar, usa la herramienta propose_decision para registrarla en el formato
problema → decisión → responsable → fecha → evidencia esperada → revisión.
Cuando identifiques una acción concreta que ejecutar (enviar un mensaje,
mover una etapa, crear una tarea), usa propose_action — nunca la ejecutes
tú mismo ni digas que ya se hizo. Toda propuesta queda pendiente de
aprobación humana explícita; nunca asumas que fue aprobada.

Estilo de respuesta: pocas preguntas pero que cambien decisiones. Cuando
tengas claridad, estructura tu respuesta como: esto sabemos, esto no
sabemos, esta parece ser la restricción, esto está en riesgo, esta es la
decisión que necesitamos. Sé directo y breve — comportamiento de un COO
disciplinado, no de un chatbot genérico.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "propose_decision",
    description:
      "Registra una decisión propuesta en el formato problema → decisión → responsable → fecha → evidencia esperada → revisión. Úsala cuando el diagnóstico ya sea suficiente para recomendar una decisión concreta. Nunca implica que la decisión ya fue tomada — queda pendiente de que un humano la revise.",
    input_schema: {
      type: "object",
      properties: {
        problem: { type: "string", description: "El problema real detectado, no el síntoma inicial." },
        decision: { type: "string", description: "La decisión recomendada." },
        owner_id: { type: "string", description: "UUID del team_member responsable, si se conoce." },
        due_date: { type: "string", description: "Fecha límite en formato YYYY-MM-DD." },
        expected_evidence: { type: "string", description: "Qué evidencia confirmaría que la decisión funcionó." },
        review_date: { type: "string", description: "Fecha en formato YYYY-MM-DD para revisar el resultado." },
      },
      required: ["problem", "decision"],
    },
  },
  {
    name: "propose_action",
    description:
      "Propone una acción concreta y ejecutable (enviar un mensaje, mover una etapa, crear una tarea, etc.). Nunca la ejecutes — solo la registras como propuesta pendiente de aprobación humana.",
    input_schema: {
      type: "object",
      properties: {
        action_type: { type: "string", description: "Tipo de acción, ej. 'send_message', 'move_deal_stage', 'create_task'." },
        payload: { type: "object", description: "Datos que la acción necesitaría para ejecutarse." },
        reversible: { type: "boolean", description: "Si la acción se puede deshacer fácilmente." },
        decision_id: { type: "string", description: "UUID de una decisión propuesta previamente relacionada, si aplica." },
      },
      required: ["action_type", "payload"],
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing_auth" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData.user) return json({ error: "invalid_session" }, 401);

    const body = await req.json();
    const message = (body.message || "").trim();
    const image = body.image as { dataUrl?: string; name?: string } | undefined;
    if (!message && !image?.dataUrl) return json({ error: "empty_message" }, 400);

    // ---------- Resolve or create the case ----------
    let caseId = body.caseId as string | undefined;
    if (!caseId) {
      const { data: newCase, error: caseErr } = await sb
        .from("marco_cases")
        .insert({ title: message.slice(0, 60), created_by: userData.user.id })
        .select()
        .single();
      if (caseErr) return json({ error: caseErr.message }, 400);
      caseId = newCase.id;
    }

    // ---------- Evidence: aggregates only, never raw contact rows ----------
    const [{ count: contactsCount }, deals, { count: overdueCount }] = await Promise.all([
      sb.from("contacts").select("id", { count: "exact", head: true }),
      sb.from("deals").select("stage, status"),
      sb.from("activities").select("id", { count: "exact", head: true }).eq("done", false).lt("due_at", new Date().toISOString()),
    ]);
    const stageCounts: Record<string, number> = {};
    (deals.data || []).forEach((d: { stage: string | null; status: string }) => {
      if (d.status !== "open") return;
      const key = d.stage || "sin_etapa";
      stageCounts[key] = (stageCounts[key] || 0) + 1;
    });
    const evidence =
      `Evidencia agregada de esta cuenta (no PII): ${contactsCount ?? 0} contactos totales; ` +
      `negocios abiertos por etapa: ${JSON.stringify(stageCounts)}; ` +
      `${overdueCount ?? 0} actividades vencidas sin completar.`;

    // ---------- Load history + persist the incoming user message ----------
    const { data: history } = await sb
      .from("marco_messages")
      .select("role, content")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true });

    await sb.from("marco_messages").insert({ case_id: caseId, role: "user", content: message, image_url: image?.dataUrl || null });

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

    // Only the current turn's image is ever sent to Claude — past images
    // aren't replayed from history on every subsequent call, or token cost
    // would grow with every image ever attached to the conversation.
    const currentText = `${evidence}\n\nMensaje del usuario: ${message}`;
    const currentContent: Anthropic.MessageParam["content"] = image?.dataUrl
      ? [imageBlockFromDataUrl(image.dataUrl), { type: "text", text: currentText }]
      : currentText;

    const messages: Anthropic.MessageParam[] = [
      ...(history || []).map((m: { role: string; content: string }) => ({
        role: (m.role === "marco" ? "assistant" : "user") as "assistant" | "user",
        content: m.content,
      })),
      { role: "user", content: currentContent },
    ];

    const createdDecisions: unknown[] = [];
    const createdActions: unknown[] = [];
    let finalText = "";

    // Simple tool loop: Claude proposes via tools, we persist, we reply
    // with tool_result and let it continue — bounded so a stray loop
    // can't run forever.
    for (let turn = 0; turn < 4; turn++) {
      const response = await anthropic.messages.create({
        model: "claude-opus-5",
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
        tools: TOOLS,
        messages,
      });

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
      finalText = textBlocks.map((b) => b.text).join("\n\n") || finalText;

      if (toolUses.length === 0) break;

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        if (use.name === "propose_decision") {
          const input = use.input as Record<string, unknown>;
          const { data } = await sb
            .from("marco_decisions")
            .insert({ case_id: caseId, account_id: undefined, ...input })
            .select()
            .single();
          if (data) createdDecisions.push(data);
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: "Decisión registrada como propuesta, pendiente de revisión humana." });
        } else if (use.name === "propose_action") {
          const input = use.input as Record<string, unknown>;
          const { data } = await sb
            .from("marco_actions")
            .insert({ case_id: caseId, ...input })
            .select()
            .single();
          if (data) createdActions.push(data);
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: "Acción registrada como propuesta, pendiente de aprobación humana. No se ejecutó." });
        } else {
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: "Herramienta desconocida.", is_error: true });
        }
      }
      messages.push({ role: "user", content: toolResults });

      if (response.stop_reason !== "tool_use") break;
    }

    if (finalText) {
      await sb.from("marco_messages").insert({ case_id: caseId, role: "marco", content: finalText });
    }

    return json({ caseId, reply: finalText, decisions: createdDecisions, actions: createdActions });
  } catch (e) {
    console.error("[marco-chat]", e);
    return json({ error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Parses "data:image/jpeg;base64,<data>" (as produced by the client's
// canvas.toDataURL) into a Claude vision content block.
function imageBlockFromDataUrl(dataUrl: string): Anthropic.ImageBlockParam {
  const match = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("invalid_image");
  const [, mediaType, data] = match;
  return {
    type: "image",
    source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data },
  };
}
