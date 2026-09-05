export function buildAdminOtpSendParams(email: string) {
  return {
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true as const },
  };
}

export function buildAdminOtpVerifyParams(email: string, token: string) {
  return {
    email: email.trim().toLowerCase(),
    token: token.replace(/\s+/g, ""),
    type: "email" as const,
  };
}
