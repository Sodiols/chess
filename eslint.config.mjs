import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", ".preview/**", "next-env.d.ts", "public/engine/**"] },
  ...coreWebVitals,
  ...typescript,
];

export default config;
