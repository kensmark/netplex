declare module '*validate.generated.js' {
  interface Validator {
    (data: unknown): boolean;
    errors?: { instancePath: string; message?: string }[] | null;
  }
  const validate: Validator;
  export default validate;
}
declare module '*validate-v1.generated.js' {
  interface Validator {
    (data: unknown): boolean;
    errors?: { instancePath: string; message?: string }[] | null;
  }
  const validate: Validator;
  export default validate;
}
declare module '*validate-packages.generated.js' {
  export const validateTheme: (data: unknown) => boolean;
  export const validateLayout: (data: unknown) => boolean;
}
