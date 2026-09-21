(() => {
  "use strict";

  const cfg = window.NGT_CONFIG;

  if (!cfg) {
    throw new Error("Falta window.NGT_CONFIG. Revisa config.js.");
  }

  if (!window.supabase) {
    throw new Error("No se pudo cargar supabase-js.");
  }

  const { createClient } = window.supabase;

  // IMPORTANTE:
  // La clave del navegador debe ser Publishable/anon.
  // NUNCA service_role.
  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  const state = {
    user: null,
    profile: null,
    experience: null,
    tariffs: new Map(),
    busy: false,
    lastOperation: null
  };

  const el = {
    loginView: document.getElementById("loginView"),
    panelView: document.getElementById("panelView"),
    loginForm: document.getElementById("loginForm"),
    emailInput: document.getElementById("emailInput"),
    passwordInput: document.getElementById("passwordInput"),
    loginButton: document.getElementById("loginButton"),
    loginError: document.getElementById("loginError"),

    experienceName: document.getElementById("experienceName"),
    operatorName: document.getElementById("operatorName"),
    connectionBadge: document.getElementById("connectionBadge"),
    logoutButton: document.getElementById("logoutButton"),

    generalButton: document.getElementById("generalButton"),
    residentButton: document.getElementById("residentButton"),
    courtesyButton: document.getElementById("courtesyButton"),

    generalPrice: document.getElementById("generalPrice"),
    residentPrice: document.getElementById("residentPrice"),
    courtesyPrice: document.getElementById("courtesyPrice"),

    todayDate: document.getElementById("todayDate"),
    todayGeneral: document.getElementById("todayGeneral"),
    todayResident: document.getElementById("todayResident"),
    todayCourtesy: document.getElementById("todayCourtesy"),
    todayTotal: document.getElementById("todayTotal"),
    refreshButton: document.getElementById("refreshButton"),
    globalMessage: document.getElementById("globalMessage"),

    residentDialog: document.getElementById("residentDialog"),
    residentForm: document.getElementById("residentForm"),
    residentConfirmed: document.getElementById("residentConfirmed"),
    confirmResidentButton: document.getElementById("confirmResidentButton"),

    courtesyDialog: document.getElementById("courtesyDialog"),
    courtesyForm: document.getElementById("courtesyForm"),
    courtesyNote: document.getElementById("courtesyNote"),
    confirmCourtesyButton: document.getElementById("confirmCourtesyButton"),

    resultDialog: document.getElementById("resultDialog"),
    resultTariff: document.getElementById("resultTariff"),
    resultAccessCode: document.getElementById("resultAccessCode"),
    resultPrice: document.getElementById("resultPrice"),
    resultCreatedAt: document.getElementById("resultCreatedAt"),
    qrContainer: document.getElementById("qrContainer"),
    copyCodeButton: document.getElementById("copyCodeButton"),
    newAccessButton: document.getElementById("newAccessButton")
  };

  function show(view) {
    el.loginView.classList.toggle("hidden", view !== "login");
    el.panelView.classList.toggle("hidden", view !== "panel");
  }

  function setMessage(node, text = "", type = "") {
    node.textContent = text;
    node.className = "message";
    if (!text) {
      node.classList.add("hidden");
      return;
    }
    if (type) node.classList.add(type);
  }

  function money(value) {
    const n = Number(value ?? 0);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2
    }).format(n);
  }

  function formatDateForElSalvador(date = new Date()) {
    return new Intl.DateTimeFormat("es-SV", {
      timeZone: cfg.TIME_ZONE,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(date);
  }

  function formatTimeForElSalvador(dateValue) {
    const date = dateValue ? new Date(dateValue) : new Date();
    return new Intl.DateTimeFormat("es-SV", {
      timeZone: cfg.TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  }

  function setBusy(value) {
    state.busy = value;

    const disable = value || !navigator.onLine || !state.experience;

    el.generalButton.disabled = disable || !state.tariffs.has("GENERAL");
    el.residentButton.disabled = disable || !state.tariffs.has("RESIDENT");
    el.courtesyButton.disabled = disable || !state.tariffs.has("COURTESY");

    el.refreshButton.disabled = value;
    el.loginButton.disabled = value;
    el.confirmResidentButton.disabled = value;
    el.confirmCourtesyButton.disabled = value;
  }

  function updateConnectionState() {
    const online = navigator.onLine;
    el.connectionBadge.textContent = online ? "Online" : "Sin conexión";
    el.connectionBadge.classList.toggle("online", online);
    el.connectionBadge.classList.toggle("offline", !online);

    if (!online && !el.panelView.classList.contains("hidden")) {
      setMessage(
        el.globalMessage,
        "Sin conexión. Por seguridad contable, esta versión no crea operaciones offline.",
        "error"
      );
    } else if (online && el.globalMessage.textContent.includes("Sin conexión")) {
      setMessage(el.globalMessage);
    }

    setBusy(state.busy);
  }

  async function requireAuthorizedProfile(userId) {
    const { data, error } = await sb
      .from("profiles")
      .select("id, display_name, role, active")
      .eq("id", userId)
      .single();

    if (error) throw error;
    if (!data?.active) throw new Error("Usuario desactivado.");

    const allowed = ["APLAN_OPERATOR", "APLAN_ADMIN"];
    if (!allowed.includes(data.role)) {
      throw new Error("Este usuario no tiene acceso al panel APLAN.");
    }

    return data;
  }

  async function loadExperience() {
    const { data, error } = await sb
      .from("experiences")
      .select("id, code, name, timezone, active")
      .eq("code", cfg.EXPERIENCE_CODE)
      .eq("active", true)
      .single();

    if (error) throw error;
    return data;
  }

  async function loadTariffs(experienceId) {
    /*
      Solo se leen precios públicos para mostrar la interfaz.
      La cantidad correspondiente a NGT NO se necesita en este panel.

      El backend debe volver a resolver y congelar los importes al crear
      la operación. El frontend nunca es la autoridad económica.
    */
    const nowIso = new Date().toISOString();

    const { data, error } = await sb
      .from("tariff_configs")
      .select("id, tariff_type, public_price, valid_from, valid_until, active")
      .eq("experience_id", experienceId)
      .eq("active", true)
      .lte("valid_from", nowIso)
      .or(`valid_until.is.null,valid_until.gt.${nowIso}`);

    if (error) throw error;

    state.tariffs.clear();
    for (const tariff of data ?? []) {
      state.tariffs.set(tariff.tariff_type, tariff);
    }
  }

  function renderTariffs() {
    el.generalPrice.textContent = state.tariffs.has("GENERAL")
      ? money(state.tariffs.get("GENERAL").public_price)
      : "No disponible";

    el.residentPrice.textContent = state.tariffs.has("RESIDENT")
      ? money(state.tariffs.get("RESIDENT").public_price)
      : "No disponible";

    el.courtesyPrice.textContent = state.tariffs.has("COURTESY")
      ? money(state.tariffs.get("COURTESY").public_price)
      : "$0.00";
  }

  async function loadTodaySummary() {
    if (!state.experience) return;

    const { data, error } = await sb.rpc(cfg.RPC_TODAY_SUMMARY, {
      p_experience_id: state.experience.id
    });

    if (error) throw error;

    // La función puede devolver un objeto directamente o una fila.
    const summary = Array.isArray(data) ? data[0] : data;

    el.todayGeneral.textContent = summary?.general_count ?? 0;
    el.todayResident.textContent = summary?.resident_count ?? 0;
    el.todayCourtesy.textContent = summary?.courtesy_count ?? 0;
    el.todayTotal.textContent = summary?.total_count ?? 0;
    el.todayDate.textContent = formatDateForElSalvador();
  }

  async function createOperation({
    tariffType,
    verificationDocumentType = null,
    courtesyReason = null,
    courtesyNote = null
  }) {
    if (state.busy) return;
    if (!navigator.onLine) {
      setMessage(
        el.globalMessage,
        "No se puede crear el acceso sin conexión en esta versión.",
        "error"
      );
      return;
    }

    setBusy(true);
    setMessage(el.globalMessage);

    try {
      /*
        Este RPC es la barrera de seguridad:
        - valida el usuario y rol;
        - resuelve la tarifa vigente server-side;
        - obliga evidencia para RESIDENT;
        - obliga motivo para COURTESY;
        - genera access_code;
        - congela snapshots económicos;
        - escribe audit log.

        El navegador NO envía public_price ni ngt_amount.
      */
      const { data, error } = await sb.rpc(cfg.RPC_CREATE_OPERATION, {
        p_experience_id: state.experience.id,
        p_tariff_type: tariffType,
        p_verification_document_type: verificationDocumentType,
        p_courtesy_reason: courtesyReason,
        p_courtesy_note: courtesyNote
      });

      if (error) throw error;

      const operation = Array.isArray(data) ? data[0] : data;
      if (!operation?.access_code) {
        throw new Error("El servidor no devolvió un access_code válido.");
      }

      state.lastOperation = operation;
      showOperationResult(operation);
      await loadTodaySummary();
    } catch (error) {
      console.error(error);
      setMessage(
        el.globalMessage,
        humanizeError(error),
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  function humanizeError(error) {
    const raw = String(error?.message ?? error ?? "");

    if (/jwt|session|auth/i.test(raw)) {
      return "Tu sesión no es válida. Vuelve a iniciar sesión.";
    }

    if (/permission|policy|rls|authorized|role/i.test(raw)) {
      return "No tienes permiso para realizar esta acción.";
    }

    if (/network|fetch/i.test(raw)) {
      return "No se pudo conectar con el servidor. Comprueba Internet e inténtalo de nuevo.";
    }

    // En producción puede sustituirse por un mapa de códigos de error
    // devueltos por el backend para no mostrar detalles internos.
    return raw || "No se pudo completar la operación.";
  }

  function showOperationResult(operation) {
    const labels = {
      GENERAL: "Tarifa general",
      RESIDENT: "Tarifa salvadoreña",
      COURTESY: "Cortesía"
    };

    el.resultTariff.textContent = labels[operation.tariff_type] ?? operation.tariff_type;
    el.resultAccessCode.textContent = operation.access_code;
    el.resultPrice.textContent = money(operation.public_price ?? 0);
    el.resultCreatedAt.textContent = formatTimeForElSalvador(operation.created_at);

    el.qrContainer.innerHTML = "";

    if (window.QRCode) {
      new window.QRCode(el.qrContainer, {
        text: operation.access_code,
        width: 160,
        height: 160,
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } else {
      el.qrContainer.textContent = "QR no disponible";
    }

    if (!el.resultDialog.open) {
      el.resultDialog.showModal();
    }
  }

  async function initializePanel(session) {
    state.user = session.user;
    setBusy(true);

    try {
      state.profile = await requireAuthorizedProfile(session.user.id);
      state.experience = await loadExperience();
      await loadTariffs(state.experience.id);

      el.experienceName.textContent = state.experience.name;
      el.operatorName.textContent =
        state.profile.display_name || session.user.email || "Operador";

      renderTariffs();
      await loadTodaySummary();
      show("panel");
    } catch (error) {
      console.error(error);
      await sb.auth.signOut();
      show("login");
      setMessage(el.loginError, humanizeError(error), "error");
    } finally {
      setBusy(false);
      updateConnectionState();
    }
  }

  async function bootstrap() {
    el.todayDate.textContent = formatDateForElSalvador();
    updateConnectionState();

    const { data, error } = await sb.auth.getSession();

    if (error) {
      console.error(error);
      show("login");
      setMessage(el.loginError, "No se pudo restaurar la sesión.", "error");
      return;
    }

    if (data.session) {
      await initializePanel(data.session);
    } else {
      show("login");
    }
  }

  // LOGIN
  el.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.busy) return;

    setBusy(true);
    setMessage(el.loginError);

    try {
      const email = el.emailInput.value.trim();
      const password = el.passwordInput.value;

      const { data, error } = await sb.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      if (!data.session) throw new Error("No se recibió una sesión válida.");

      el.passwordInput.value = "";
      await initializePanel(data.session);
    } catch (error) {
      console.error(error);
      setMessage(el.loginError, "Correo o contraseña incorrectos, o acceso no autorizado.", "error");
    } finally {
      setBusy(false);
    }
  });

  // LOGOUT
  el.logoutButton.addEventListener("click", async () => {
    setBusy(true);
    try {
      await sb.auth.signOut();
      state.user = null;
      state.profile = null;
      state.experience = null;
      state.tariffs.clear();
      show("login");
    } finally {
      setBusy(false);
    }
  });

  // GENERAL
  el.generalButton.addEventListener("click", () => {
    createOperation({ tariffType: "GENERAL" });
  });

  // RESIDENT
  el.residentButton.addEventListener("click", () => {
    el.residentForm.reset();
    el.residentDialog.showModal();
  });

  el.residentForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = new FormData(el.residentForm);
    const documentType = form.get("documentType");

    if (!documentType || !el.residentConfirmed.checked) return;

    el.residentDialog.close();

    await createOperation({
      tariffType: "RESIDENT",
      verificationDocumentType: String(documentType)
    });
  });

  // COURTESY
  el.courtesyButton.addEventListener("click", () => {
    el.courtesyForm.reset();
    el.courtesyDialog.showModal();
  });

  el.courtesyForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = new FormData(el.courtesyForm);
    const reason = form.get("courtesyReason");

    if (!reason) return;

    const note = el.courtesyNote.value.trim();

    el.courtesyDialog.close();

    await createOperation({
      tariffType: "COURTESY",
      courtesyReason: String(reason),
      courtesyNote: note || null
    });
  });

  // CIERRES DE DIALOG
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = document.getElementById(button.dataset.closeDialog);
      dialog?.close();
    });
  });

  // RESULTADO
  el.copyCodeButton.addEventListener("click", async () => {
    const code = state.lastOperation?.access_code;
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      el.copyCodeButton.textContent = "Copiado";
      setTimeout(() => {
        el.copyCodeButton.textContent = "Copiar código";
      }, 1200);
    } catch {
      el.copyCodeButton.textContent = code;
    }
  });

  el.newAccessButton.addEventListener("click", () => {
    el.resultDialog.close();
    state.lastOperation = null;
  });

  // REFRESH
  el.refreshButton.addEventListener("click", async () => {
    if (state.busy) return;
    setBusy(true);
    try {
      await loadTariffs(state.experience.id);
      renderTariffs();
      await loadTodaySummary();
      setMessage(el.globalMessage, "Datos actualizados.", "success");
      setTimeout(() => setMessage(el.globalMessage), 1800);
    } catch (error) {
      console.error(error);
      setMessage(el.globalMessage, humanizeError(error), "error");
    } finally {
      setBusy(false);
    }
  });

  window.addEventListener("online", updateConnectionState);
  window.addEventListener("offline", updateConnectionState);

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      show("login");
    }
  });

  bootstrap();
})();
