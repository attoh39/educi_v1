// Explicit env typing so a mistyped variable name is caught at compile time
// (Vite's default ImportMetaEnv is `Record<string, any>`, which hides typos).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
