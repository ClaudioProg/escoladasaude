export function completeAuthLogin({
  response,
  persistSession,
  successMessage,
  showSuccess,
  navigate,
  destination,
}) {
  persistSession(response);
  showSuccess(successMessage);
  navigate(destination, { replace: true });
}
