/*
  NGT · APLAN PANEL
  =================
  1) Copia la URL de tu proyecto Supabase.
  2) Copia la Publishable Key / anon key del proyecto.
  3) NO pongas aquí la service_role key.
*/

window.NGT_CONFIG = {
  SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
  SUPABASE_ANON_KEY: "TU-PUBLISHABLE-O-ANON-KEY",

  // Código estable de la experiencia configurada en la tabla experiences.
  EXPERIENCE_CODE: "PALACIO_NACIONAL",

  // Zona horaria contractual.
  TIME_ZONE: "America/El_Salvador",

  // Nombres de las funciones RPC que implementará el backend.
  RPC_CREATE_OPERATION: "aplan_create_operation",
  RPC_TODAY_SUMMARY: "aplan_today_summary"
};
