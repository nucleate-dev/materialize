export default function RegistrationAccountCreatedEmailVerificationPending() {
  return (
    <div className="mt-4 mx-auto max-w-lg">
      <h2 className="text-sm font-semibold text-foreground">
        Your account is created!
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {" "}
        We sent you an email. Please click the link in your inbox to verify your
        email.{" "}
      </p>
    </div>
  );
}
