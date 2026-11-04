/// <reference types="vite/client" />

declare module '*.less?inline' {
  const content: string
  export default content
}
