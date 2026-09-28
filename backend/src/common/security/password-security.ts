import * as argon2 from "argon2";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_COMPLEXITY_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s])\S+$/;

export const PASSWORD_HASH_OPTIONS: argon2.Options & { type: number } = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};

const weakFragments = ["password", "contraseña", "qwerty", "123456", "admin"];

export function passwordPolicyError(password: string, identityValues: Array<string | undefined> = []) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return "La contraseña debe tener al menos " + PASSWORD_MIN_LENGTH + " caracteres";
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return "La contraseña no puede superar " + PASSWORD_MAX_LENGTH + " caracteres";
  }

  if (!PASSWORD_COMPLEXITY_PATTERN.test(password)) {
    return "La contraseña debe incluir mayúscula, minúscula, número y símbolo, sin espacios";
  }

  const normalizedPassword = password.toLocaleLowerCase();
  if (weakFragments.some((fragment) => normalizedPassword.includes(fragment))) {
    return "La contraseña contiene una secuencia demasiado predecible";
  }

  const includesIdentity = identityValues
    .map((value) => value?.trim().toLocaleLowerCase())
    .filter((value): value is string => Boolean(value && value.length >= 3))
    .some((value) => normalizedPassword.includes(value));

  return includesIdentity ? "La contraseña no puede incluir datos del usuario" : undefined;
}
