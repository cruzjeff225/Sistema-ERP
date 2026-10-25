export function runtimePolicy(environment: string, frontendUrl: string, trustProxyHops = 0) {
  const production=environment==='production';
  return {
    allowedOrigins: [...new Set([new URL(frontendUrl).origin,...(production?[]:['http://localhost:5173','http://127.0.0.1:5173'])])],
    swaggerEnabled: !production,
    trustProxyHops,
  };
}
