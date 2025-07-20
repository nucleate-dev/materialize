import RegistrationForm from "./RegistrationForm";

export default function Register() {
  return (
    <div className="w-full min-h-screen grid place-items-center bg-white">
      <div className="max-w-md w-full">
        <h2 className="text-lg font-semibold text-black">Create an account</h2>
        <RegistrationForm />
      </div>
    </div>
  );
}
