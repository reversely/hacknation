declare module '*.css' {
  const text: string;
  export default text;
}
// app/src/inference/translator.ts reads Expo's process.env; the bundle imports only its types.
declare const process: { env: Record<string, string | undefined> };
