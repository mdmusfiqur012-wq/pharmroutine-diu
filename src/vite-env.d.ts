/// <reference types="vite/client" />

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.png?inline' {
  const dataUri: string;
  export default dataUri;
}
