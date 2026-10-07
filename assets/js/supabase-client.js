// Compatibilidade com arquivos antigos do projeto.
// O cliente real fica centralizado em core/supabase.js para que todas as
// páginas compartilhem exatamente a mesma regra de sessão por abas.
export { supabase } from "./core/supabase.js";
