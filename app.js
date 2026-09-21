(() => {
  "use strict";

  const cfg = window.NGT_CONFIG;

  if (!cfg) {
    throw new Error("Falta window.NGT_CONFIG.");
  }

  const API_URL =
    `${cfg.SUPABASE_URL}/functions/v1/aplan-api`;

  const SESSION_KEY =
    "ngt_aplan_panel_session";

  const state = {
    sessionToken: null,
    experience: null,
    tariffs: new Map(),
    busy: false,
    lastOperation: null
  };

  const el = {
    loginView: document.getElementById("loginView"),
    panelView: document.getElementById("panelView"),

    loginForm: document.getElementById("loginForm"),
    accessCodeInput: document.getElementById("accessCodeInput"),
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
    el.loginView.classList.toggle(
      "hidden",
      view !== "login"
    );

    el.panelView.classList.toggle(
      "hidden",
      view !== "panel"
    );

    if (view === "login") {
      setTimeout(
        () => el.accessCodeInput?.focus(),
        50
      );
    }
  }

  function setMessage(
    node,
    text = "",
    type = ""
  ) {
    node.textContent = text;
    node.className = "message";

    if (!text) {
      node.classList.add("hidden");
      return;
    }

    if (type) {
      node.classList.add(type);
    }
  }

  function money(value) {
    return new Intl.NumberFormat(
      "en-US",
      {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2
      }
    ).format(Number(value ?? 0));
  }

  function formatDateForElSalvador(
    date = new Date()
  ) {
    return new Intl.DateTimeFormat(
      "es-SV",
      {
        timeZone: cfg.TIME_ZONE,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      }
    ).format(date);
  }

  function formatTimeForElSalvador(
    dateValue
  ) {
    const date =
      dateValue
        ? new Date(dateValue)
        : new Date();

    return new Intl.DateTimeFormat(
      "es-SV",
      {
        timeZone: cfg.TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    ).format(date);
  }

  function saveSession(token) {
    state.sessionToken = token;

    sessionStorage.setItem(
      SESSION_KEY,
      token
    );
  }

  function clearSession() {
    state.sessionToken = null;

    sessionStorage.removeItem(
      SESSION_KEY
    );
  }

  async function api(
    action,
    payload = {},
    requiresSession = true
  ) {
    const headers = {
      "Content-Type": "application/json"
    };

    // La publishable/anon key puede estar en el navegador.
    // Nunca uses service_role aquí.
    if (cfg.SUPABASE_ANON_KEY) {
      headers["apikey"] =
        cfg.SUPABASE_ANON_KEY;
    }

    if (
      requiresSession &&
      state.sessionToken
    ) {
      headers["Authorization"] =
        `Bearer ${state.sessionToken}`;
    }

    const response = await fetch(
      API_URL,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          action,
          ...payload
        })
      }
    );

    let data = null;

    try {
      data = await response.json();
    } catch {
      // Nada.
    }

    if (!response.ok) {
      const error = new Error(
        data?.error || "REQUEST_FAILED"
      );

      error.status = response.status;
      error.data = data;

      throw error;
    }

    return data;
  }

  function setBusy(value) {
    state.busy = value;

    const disableAccess =
      value ||
      !navigator.onLine ||
      !state.experience;

    el.generalButton.disabled =
      disableAccess ||
      !state.tariffs.has("GENERAL");

    el.residentButton.disabled =
      disableAccess ||
      !state.tariffs.has("RESIDENT");

    el.courtesyButton.disabled =
      disableAccess ||
      !state.tariffs.has("COURTESY");

    el.refreshButton.disabled = value;
    el.loginButton.disabled = value;
    el.confirmResidentButton.disabled = value;
    el.confirmCourtesyButton.disabled = value;
  }

  function updateConnectionState() {
    const online =
      navigator.onLine;

    el.connectionBadge.textContent =
      online
        ? "Online"
        : "Sin conexión";

    el.connectionBadge.classList.toggle(
      "online",
      online
    );

    el.connectionBadge.classList.toggle(
      "offline",
      !online
    );

    if (
      !online &&
      !el.panelView.classList.contains(
        "hidden"
      )
    ) {
      setMessage(
        el.globalMessage,
        "Sin conexión. Esta versión no crea operaciones offline.",
        "error"
      );
    } else if (
      online &&
      el.globalMessage.textContent.includes(
        "Sin conexión"
      )
    ) {
      setMessage(
        el.globalMessage
      );
    }

    setBusy(state.busy);
  }

  function humanizeError(error) {
    const code =
      String(error?.message ?? "");

    if (code === "ACCESS_DENIED") {
      return "Código incorrecto.";
    }

    if (code === "TOO_MANY_ATTEMPTS") {
      return "Demasiados intentos incorrectos. Espera unos minutos e inténtalo de nuevo.";
    }

    if (
      code === "INVALID_SESSION" ||
      code === "SESSION_EXPIRED"
    ) {
      return "La sesión terminó. Introduce de nuevo el código de acceso.";
    }

    if (
      code === "RESIDENCY_VERIFICATION_REQUIRED"
    ) {
      return "Debes confirmar la verificación de residencia.";
    }

    if (
      code === "COURTESY_REASON_REQUIRED"
    ) {
      return "Debes seleccionar el motivo de la cortesía.";
    }

    if (
      /fetch|network/i.test(
        String(error)
      )
    ) {
      return "No se pudo conectar con Supabase. Comprueba Internet.";
    }

    return "No se pudo completar la operación.";
  }

  function renderTariffs() {
    el.generalPrice.textContent =
      state.tariffs.has("GENERAL")
        ? money(
            state.tariffs.get(
              "GENERAL"
            ).public_price
          )
        : "No disponible";

    el.residentPrice.textContent =
      state.tariffs.has("RESIDENT")
        ? money(
            state.tariffs.get(
              "RESIDENT"
            ).public_price
          )
        : "No disponible";

    el.courtesyPrice.textContent =
      state.tariffs.has("COURTESY")
        ? money(
            state.tariffs.get(
              "COURTESY"
            ).public_price
          )
        : "$0.00";
  }

  function renderSummary(summary) {
    el.todayGeneral.textContent =
      summary?.general_count ?? 0;

    el.todayResident.textContent =
      summary?.resident_count ?? 0;

    el.todayCourtesy.textContent =
      summary?.courtesy_count ?? 0;

    el.todayTotal.textContent =
      summary?.total_count ?? 0;

    el.todayDate.textContent =
      formatDateForElSalvador();
  }

  async function loadPanel() {
    const data =
      await api(
        "bootstrap"
      );

    state.experience =
      data.experience;

    state.tariffs.clear();

    for (
      const tariff
      of data.tariffs ?? []
    ) {
      state.tariffs.set(
        tariff.tariff_type,
        tariff
      );
    }

    el.experienceName.textContent =
      state.experience?.name ??
      "Palacio Nacional";

    el.operatorName.textContent =
      "APLAN";

    renderTariffs();
    renderSummary(data.summary);

    show("panel");
  }

  async function refreshSummary() {
    const summary =
      await api(
        "today_summary"
      );

    renderSummary(summary);
  }

  async function createOperation({
    tariffType,
    verificationDocumentType = null,
    courtesyReason = null,
    courtesyNote = null
  }) {
    if (state.busy) {
      return;
    }

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
      const operation =
        await api(
          "create_operation",
          {
            tariff_type:
              tariffType,

            verification_document_type:
              verificationDocumentType,

            courtesy_reason:
              courtesyReason,

            courtesy_note:
              courtesyNote
          }
        );

      if (
        !operation?.access_code
      ) {
        throw new Error(
          "INVALID_OPERATION_RESPONSE"
        );
      }

      state.lastOperation =
        operation;

      showOperationResult(
        operation
      );

      await refreshSummary();

    } catch (error) {
      console.error(error);

      if (
        error.status === 401
      ) {
        clearSession();
        show("login");
      }

      setMessage(
        error.status === 401
          ? el.loginError
          : el.globalMessage,
        humanizeError(error),
        "error"
      );

    } finally {
      setBusy(false);
    }
  }

  function showOperationResult(
    operation
  ) {
    const labels = {
      GENERAL:
        "Tarifa general",

      RESIDENT:
        "Tarifa salvadoreña",

      COURTESY:
        "Cortesía"
    };

    el.resultTariff.textContent =
      labels[
        operation.tariff_type
      ] ??
      operation.tariff_type;

    el.resultAccessCode.textContent =
      operation.access_code;

    el.resultPrice.textContent =
      money(
        operation.public_price ?? 0
      );

    el.resultCreatedAt.textContent =
      formatTimeForElSalvador(
        operation.created_at
      );

    el.qrContainer.innerHTML =
      "";

    if (window.QRCode) {
      new window.QRCode(
        el.qrContainer,
        {
          text:
            operation.access_code,

          width: 160,
          height: 160,

          correctLevel:
            window.QRCode
              .CorrectLevel.M
        }
      );
    } else {
      el.qrContainer.textContent =
        "QR no disponible";
    }

    if (
      !el.resultDialog.open
    ) {
      el.resultDialog.showModal();
    }
  }

  // ==========================================================
  // LOGIN
  // ==========================================================

  el.accessCodeInput.addEventListener(
    "input",
    () => {
      el.accessCodeInput.value =
        el.accessCodeInput.value
          .replace(/\D/g, "")
          .slice(0, 5);

      setMessage(
        el.loginError
      );
    }
  );

  el.loginForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      if (state.busy) {
        return;
      }

      const code =
        el.accessCodeInput
          .value
          .trim();

      if (!/^\d{5}$/.test(code)) {
        setMessage(
          el.loginError,
          "Introduce un código de 5 dígitos.",
          "error"
        );

        return;
      }

      setBusy(true);
      setMessage(el.loginError);

      try {
        const data =
          await api(
            "login",
            { code },
            false
          );

        if (
          !data?.session_token
        ) {
          throw new Error(
            "INVALID_SESSION_RESPONSE"
          );
        }

        saveSession(
          data.session_token
        );

        // Se elimina el código del campo
        // inmediatamente.
        el.accessCodeInput.value =
          "";

        await loadPanel();

      } catch (error) {
        console.error(error);

        clearSession();

        el.accessCodeInput.value =
          "";

        el.accessCodeInput.focus();

        setMessage(
          el.loginError,
          humanizeError(error),
          "error"
        );

      } finally {
        setBusy(false);
      }
    }
  );

  // ==========================================================
  // LOGOUT
  // ==========================================================

  el.logoutButton.addEventListener(
    "click",
    () => {
      clearSession();

      state.experience = null;
      state.tariffs.clear();
      state.lastOperation = null;

      el.accessCodeInput.value =
        "";

      show("login");
    }
  );

  // ==========================================================
  // GENERAL
  // ==========================================================

  el.generalButton.addEventListener(
    "click",
    () => {
      createOperation({
        tariffType: "GENERAL"
      });
    }
  );

  // ==========================================================
  // RESIDENTE
  // ==========================================================

  el.residentButton.addEventListener(
    "click",
    () => {
      el.residentForm.reset();
      el.residentDialog.showModal();
    }
  );

  el.residentForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const form =
        new FormData(
          el.residentForm
        );

      const documentType =
        form.get(
          "documentType"
        );

      if (
        !documentType ||
        !el.residentConfirmed.checked
      ) {
        return;
      }

      el.residentDialog.close();

      await createOperation({
        tariffType:
          "RESIDENT",

        verificationDocumentType:
          String(documentType)
      });
    }
  );

  // ==========================================================
  // CORTESÍA
  // ==========================================================

  el.courtesyButton.addEventListener(
    "click",
    () => {
      el.courtesyForm.reset();
      el.courtesyDialog.showModal();
    }
  );

  el.courtesyForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const form =
        new FormData(
          el.courtesyForm
        );

      const reason =
        form.get(
          "courtesyReason"
        );

      if (!reason) {
        return;
      }

      const note =
        el.courtesyNote
          .value
          .trim();

      el.courtesyDialog.close();

      await createOperation({
        tariffType:
          "COURTESY",

        courtesyReason:
          String(reason),

        courtesyNote:
          note || null
      });
    }
  );

  // ==========================================================
  // DIALOGS
  // ==========================================================

  document
    .querySelectorAll(
      "[data-close-dialog]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            const dialog =
              document.getElementById(
                button.dataset
                  .closeDialog
              );

            dialog?.close();
          }
        );
      }
    );

  el.copyCodeButton.addEventListener(
    "click",
    async () => {
      const code =
        state.lastOperation
          ?.access_code;

      if (!code) {
        return;
      }

      try {
        await navigator
          .clipboard
          .writeText(code);

        el.copyCodeButton.textContent =
          "Copiado";

        setTimeout(
          () => {
            el.copyCodeButton.textContent =
              "Copiar código";
          },
          1200
        );

      } catch {
        el.copyCodeButton.textContent =
          code;
      }
    }
  );

  el.newAccessButton.addEventListener(
    "click",
    () => {
      el.resultDialog.close();
      state.lastOperation = null;
    }
  );

  // ==========================================================
  // ACTUALIZAR
  // ==========================================================

  el.refreshButton.addEventListener(
    "click",
    async () => {
      if (state.busy) {
        return;
      }

      setBusy(true);

      try {
        await refreshSummary();

        setMessage(
          el.globalMessage,
          "Datos actualizados.",
          "success"
        );

        setTimeout(
          () => {
            setMessage(
              el.globalMessage
            );
          },
          1800
        );

      } catch (error) {
        console.error(error);

        if (
          error.status === 401
        ) {
          clearSession();
          show("login");

          setMessage(
            el.loginError,
            humanizeError(error),
            "error"
          );

          return;
        }

        setMessage(
          el.globalMessage,
          humanizeError(error),
          "error"
        );

      } finally {
        setBusy(false);
      }
    }
  );

  // ==========================================================
  // CONEXIÓN
  // ==========================================================

  window.addEventListener(
    "online",
    updateConnectionState
  );

  window.addEventListener(
    "offline",
    updateConnectionState
  );

  // ==========================================================
  // ARRANQUE
  // ==========================================================

  async function bootstrap() {
    el.todayDate.textContent =
      formatDateForElSalvador();

    updateConnectionState();

    const stored =
      sessionStorage.getItem(
        SESSION_KEY
      );

    if (!stored) {
      show("login");
      return;
    }

    state.sessionToken =
      stored;

    setBusy(true);

    try {
      await loadPanel();

    } catch (error) {
      console.error(error);

      clearSession();
      show("login");

      if (
        error.status === 401
      ) {
        setMessage(
          el.loginError,
          "La sesión terminó. Introduce de nuevo el código.",
          "error"
        );
      }

    } finally {
      setBusy(false);
    }
  }

  bootstrap();
})();
