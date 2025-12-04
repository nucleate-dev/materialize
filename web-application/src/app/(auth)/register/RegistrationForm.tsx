"use client";

import ErrorModal from "@/components/ErrorModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useMetaPixel } from "@/hooks/useMetaPixel";
import { redirectAfterLoginAtom } from "@/lib/atoms/sidebar";
import { cn } from "@/lib/classNames";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { getUTMParams } from "@/lib/utils/analytics/utmTracking";
import {
  isValidEmailInput,
  isValidPassword,
} from "@/lib/utils/auth/AuthFormValidationUtils";
import { signInWithOAuth, signUp } from "@/lib/utils/auth/SupabaseAuthUtils";
import { useAtom } from "jotai";
import { Loader2, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { OAuthSignInButton } from "../AuthComponents";
import RegistrationAccountCreatedEmailVerificationPending from "./RegistrationAccountCreatedEmailVerificationPending";

export default function RegistrationForm() {
  // Declare state variables
  const router = useRouter();
  const searchParams = useSearchParams();
  const { trackEvent } = useMetaPixel();
  const logger = useProductLogger();
  const [, setRedirectAfterLogin] = useAtom(redirectAfterLoginAtom);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [formErrors, setFormErrors] = useState({
    emailError: "",
    passwordError: "",
    confirmPasswordError: "",
  });
  const [showSuccessState, setShowSuccessState] = useState<boolean>(false);
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { email, password, firstName, lastName, confirmPassword } = formData;
  const { emailError, passwordError, confirmPasswordError } = formErrors;

  // Check if form has any validation errors or missing required fields
  const hasErrors = emailError || passwordError || confirmPasswordError;
  const hasRequiredFields =
    email && password && firstName && lastName && confirmPassword;
  const isFormValid = !hasErrors && hasRequiredFields;

  // Store redirect parameter in Jotai atom if present
  useEffect(() => {
    const redirectParam = searchParams.get("redirect");
    if (redirectParam) {
      const decodedRedirect = decodeURIComponent(redirectParam);
      setRedirectAfterLogin(decodedRedirect);
    }
  }, [searchParams, setRedirectAfterLogin]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;

      // Update form data using functional update to avoid stale closure
      setFormData((prevFormData) => {
        const newFormData = {
          ...prevFormData,
          [name]: value,
        };

        // Validate based on which field changed
        if (name === "email") {
          if (isValidEmailInput(value)) {
            setFormErrors((prev) => ({ ...prev, emailError: "" }));
          } else {
            setFormErrors((prev) => ({
              ...prev,
              emailError: "Please enter a valid email",
            }));
          }
        } else if (name === "password") {
          const passwordError = isValidPassword(value);
          setFormErrors((prev) => ({
            ...prev,
            passwordError: passwordError || "",
          }));

          // Revalidate confirmPassword when password changes
          setFormErrors((prev) => {
            if (prev.confirmPasswordError && newFormData.confirmPassword) {
              const confirmPasswordError =
                newFormData.confirmPassword !== value
                  ? "Passwords do not match"
                  : "";
              return { ...prev, confirmPasswordError };
            }
            return prev;
          });
        } else if (name === "confirmPassword") {
          // Compare against current password in newFormData
          const confirmPasswordError =
            newFormData.password !== value ? "Passwords do not match" : "";
          setFormErrors((prev) => ({ ...prev, confirmPasswordError }));
        }

        return newFormData;
      });
    },
    [], // No dependencies needed - using functional updates
  );

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      // Validate all fields before submission
      const emailValidationError = !isValidEmailInput(email)
        ? "Please enter a valid email"
        : "";
      const passwordValidationError = isValidPassword(password) || "";
      const confirmPasswordValidationError =
        password !== confirmPassword ? "Passwords do not match" : "";

      if (
        emailValidationError ||
        passwordValidationError ||
        confirmPasswordValidationError
      ) {
        setFormErrors({
          emailError: emailValidationError,
          passwordError: passwordValidationError,
          confirmPasswordError: confirmPasswordValidationError,
        });
        return;
      }

      setIsLoading(true);
      const authResponse = await signUp({
        email,
        password,
        firstName,
        lastName,
      });
      setIsLoading(false);
      if (authResponse.error) {
        setShowErrorModal(true);
        setErrorMessage(authResponse.error.message);
        return;
      }

      // Get UTM parameters - either from current URL or from sessionStorage
      // This ensures we capture attribution even if user came from homepage
      const utmParams = getUTMParams(searchParams);

      // Generate a unique event_id for deduplication between browser and server events
      const eventId = `reg_${authResponse.data.user?.id}_${Date.now()}`;

      // Track successful registration with Meta Pixel
      trackEvent(
        "CompleteRegistration",
        {
          content_name: "Account Registration",
          status: authResponse.data.session
            ? "immediate"
            : "email_verification",
          ...utmParams, // Include UTM params for Meta attribution
        },
        eventId, // Add event_id for deduplication
      );

      // Track successful registration with PostHog
      logger.log({
        event: "user_registration_completed",
        properties: {
          source: "registration_form",
          component: "RegistrationForm",
          functionName: "handleSubmit",
          registration_method: "email",
          verification_status: authResponse.data.session
            ? "immediate"
            : "email_verification_pending",
          additionalData: {
            has_session: !!authResponse.data.session,
            ...utmParams, // Include UTM params for attribution analysis
          },
        },
      });

      if (authResponse.data.session) {
        router.push("/auth/callback");
      } else {
        setShowSuccessState(true);
      }
    },
    [
      email,
      firstName,
      lastName,
      password,
      confirmPassword,
      router,
      trackEvent,
      logger,
      searchParams,
    ],
  );

  if (showSuccessState) {
    return <RegistrationAccountCreatedEmailVerificationPending />;
  }

  return (
    <div className="relative w-full max-w-md mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <ErrorModal
        show={showErrorModal}
        onClose={() => {
          setShowErrorModal(false);
        }}
        errorMessage={errorMessage}
      />

      {/* Premium Container */}
      <div className="bg-[#141517] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 text-center space-y-2 border-b border-white/5 bg-white/[0.01]">
          <div className="mx-auto w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 mb-4 shadow-inner">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-medium tracking-tight text-white">
            Create an account
          </h2>
          <p className="text-[#8A8F98] text-sm">
            Enter your details to get started with Sanara
          </p>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="firstName"
                  className="text-xs font-medium text-[#8A8F98]"
                >
                  First Name
                </Label>
                <Input
                  id="firstName"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  required
                  value={firstName}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="bg-[#0B0C0E] border-white/10 text-white focus:border-white/20 focus:ring-0 placeholder:text-white/20 h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="lastName"
                  className="text-xs font-medium text-[#8A8F98]"
                >
                  Last Name
                </Label>
                <Input
                  id="lastName"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  required
                  value={lastName}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="bg-[#0B0C0E] border-white/10 text-white focus:border-white/20 focus:ring-0 placeholder:text-white/20 h-10"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-xs font-medium text-[#8A8F98]"
              >
                Email address
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={handleChange}
                disabled={isLoading}
                className={cn(
                  "bg-[#0B0C0E] border-white/10 text-white focus:border-white/20 focus:ring-0 placeholder:text-white/20 h-10",
                  emailError && "border-red-500/50 focus:border-red-500/50",
                )}
              />
              {emailError && (
                <p className="text-xs text-red-400 mt-1">{emailError}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs font-medium text-[#8A8F98]"
              >
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={handleChange}
                disabled={isLoading}
                className={cn(
                  "bg-[#0B0C0E] border-white/10 text-white focus:border-white/20 focus:ring-0 placeholder:text-white/20 h-10",
                  passwordError && "border-red-500/50 focus:border-red-500/50",
                )}
              />
              {passwordError && (
                <p className="text-xs text-red-400 mt-1">{passwordError}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <Label
                htmlFor="confirmPassword"
                className="text-xs font-medium text-[#8A8F98]"
              >
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={handleChange}
                disabled={isLoading}
                className={cn(
                  "bg-[#0B0C0E] border-white/10 text-white focus:border-white/20 focus:ring-0 placeholder:text-white/20 h-10",
                  confirmPasswordError &&
                  "border-red-500/50 focus:border-red-500/50",
                )}
              />
              {confirmPasswordError && (
                <p className="text-xs text-red-400 mt-1">
                  {confirmPasswordError}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-10 bg-white text-black hover:bg-white/90 font-medium mt-2"
              disabled={isLoading || !isFormValid}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create account"
              )}
            </Button>
          </form>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full bg-white/5" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[#141517] px-2 text-[#8A8F98]">
                Or continue with
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <OAuthSignInButton
              onClick={async () => {
                // Get UTM parameters - either from current URL or from sessionStorage
                const utmParams = getUTMParams(searchParams);

                // Track OAuth registration initiation
                logger.log({
                  event: "oauth_registration_initiated",
                  properties: {
                    source: "registration_form",
                    component: "RegistrationForm",
                    functionName: "handleOAuthClick",
                    registration_method: "google_oauth",
                    additionalData: {
                      provider: "google",
                      ...utmParams,
                    },
                  },
                });

                // Store pending Meta Pixel registration intent to fire after OAuth redirect
                if (typeof window !== "undefined") {
                  try {
                    // Generate event_id upfront for OAuth flow
                    const oauthEventId = `reg_oauth_${Date.now()}`;
                    localStorage.setItem(
                      "pending_meta_registration",
                      JSON.stringify({
                        provider: "google",
                        utm: utmParams,
                        ts: Date.now(),
                        eventId: oauthEventId,
                      }),
                    );
                    // Clear any prior sent marker so we can emit for this new OAuth sign-up
                    localStorage.removeItem("meta_registration_sent");
                  } catch (storageError) {
                    logger.debug("warn", "Failed to persist pending meta registration intent", {
                      error:
                        storageError instanceof Error
                          ? storageError.message
                          : String(storageError),
                    });
                  }
                }

                const redirectParam = searchParams.get("redirect");
                if (redirectParam) {
                  const decodedRedirect = decodeURIComponent(redirectParam);
                  setRedirectAfterLogin(decodedRedirect);
                }
                await signInWithOAuth("google", "/auth/callback");
              }}
              provider="google"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
