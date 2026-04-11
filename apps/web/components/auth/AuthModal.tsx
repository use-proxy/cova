"use client";

import { useState, useEffect } from "react";
import { Eye, EyeOff, X, Check } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type AuthMode = "signin" | "signup";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
}

// Password strength: 1 = weak, 2 = medium, 3 = strong
function getPasswordStrength(password: string): number {
  if (password.length < 8) return 1;
  const hasLetters = /[a-zA-Z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  if (hasLetters && hasNumbers && hasSpecial) return 3;
  if (hasLetters && hasNumbers) return 2;
  return 1;
}

// Email validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Google Icon SVG
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// Arch Logo SVG
function ArchLogo() {
  return (
    <svg
      width="48"
      height="32"
      viewBox="0 0 48 32"
      fill="none"
      className="mx-auto mb-6"
    >
      <path
        d="M4 32V20C4 9 13 2 24 2C35 2 44 9 44 20V32"
        stroke="#C9A84C"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function AuthModal({
  isOpen,
  onClose,
  initialMode = "signin",
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const emailError = emailTouched && email && !isValidEmail(email);
  const passwordStrength = getPasswordStrength(password);
  const passwordsMatch = password === confirmPassword && confirmPassword !== "";

  // Reset form when mode changes
  useEffect(() => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setFullName("");
    setEmailTouched(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setAgreedToTerms(false);
    setError(null);
  }, [mode]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  const redirectAfterAuth = async (userId: string) => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    if (data) {
      router.push("/dashboard");
    } else {
      router.push("/capture");
    }
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createBrowserClient();

    if (mode === "signin") {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      await redirectAfterAuth(data.user.id);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      if (data.user) {
        // Insert profile row for the new user
        await supabase.from("profiles").insert({
          id: data.user.id,
          full_name: fullName,
        });
        await redirectAfterAuth(data.user.id);
      }
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop with dimmed landing page */}
      <div
        className="absolute inset-0 bg-[#0a1628]/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Radial blue glow behind card */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(30, 64, 120, 0.4) 0%, transparent 70%)",
        }}
      />

      {/* Modal Card */}
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl p-8 overflow-hidden"
        style={{
          background: "#0d1f3c",
          border: "1px solid rgba(201, 168, 76, 0.2)",
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.6)",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Arch Logo */}
        <ArchLogo />

        {/* Headline */}
        <h2 className="text-center text-2xl text-white mb-8 font-serif">
          {"Let's build your "}
          <span className="italic text-[#C9A84C]">style</span>
          {" profile."}
        </h2>

        {/* Global error message */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-sans">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg border border-[#C9A84C] bg-transparent text-white font-sans text-sm tracking-wide transition-colors hover:bg-[#C9A84C]/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <GoogleIcon />
            <span>Continue with Google</span>
          </button>

          {/* OR Divider */}
          <div className="relative flex items-center py-4">
            <div className="flex-1 h-px bg-[#C9A84C]/15" />
            <span className="px-4 text-xs font-sans uppercase tracking-widest text-white/50">
              OR
            </span>
            <div className="flex-1 h-px bg-[#C9A84C]/15" />
          </div>

          {/* Sign Up Only: Full Name Field */}
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-sans uppercase tracking-widest text-white/50 mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                className="w-full px-4 py-3 rounded-lg bg-[#0a1628] border border-[#C9A84C]/30 text-white font-sans placeholder:text-white/30 focus:outline-none focus:border-[#C9A84C] transition-colors"
              />
            </div>
          )}

          {/* Email Field */}
          <div>
            <label className="block text-xs font-sans uppercase tracking-widest text-white/50 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              placeholder="you@example.com"
              className={`w-full px-4 py-3 rounded-lg bg-[#0a1628] border text-white font-sans placeholder:text-white/30 focus:outline-none transition-colors ${
                emailError
                  ? "border-red-500 focus:border-red-500"
                  : "border-[#C9A84C]/30 focus:border-[#C9A84C]"
              }`}
            />
            {emailError && (
              <p className="mt-1 text-xs text-red-500 font-sans">
                Please enter a valid email address
              </p>
            )}
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-xs font-sans uppercase tracking-widest text-white/50 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 pr-12 rounded-lg bg-[#0a1628] border border-[#C9A84C]/30 text-white font-sans placeholder:text-white/30 focus:outline-none focus:border-[#C9A84C] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#C9A84C]/50 hover:text-[#C9A84C] transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Password Strength Indicator (Sign Up only) — 3 segments */}
            {mode === "signup" && password && (
              <div className="flex gap-1 mt-2">
                {[1, 2, 3].map((level) => (
                  <div
                    key={level}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      level <= passwordStrength ? "bg-[#C9A84C]" : "bg-white/10"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sign Up Only: Confirm Password */}
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-sans uppercase tracking-widest text-white/50 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full px-4 py-3 pr-12 rounded-lg bg-[#0a1628] border text-white font-sans placeholder:text-white/30 focus:outline-none transition-colors ${
                    confirmPassword && !passwordsMatch
                      ? "border-red-500 focus:border-red-500"
                      : "border-[#C9A84C]/30 focus:border-[#C9A84C]"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#C9A84C]/50 hover:text-[#C9A84C] transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {confirmPassword && !passwordsMatch && (
                <p className="mt-1 text-xs text-red-500 font-sans">
                  Passwords do not match
                </p>
              )}
              {confirmPassword && passwordsMatch && (
                <div className="flex items-center gap-1 mt-1 text-xs text-green-500 font-sans">
                  <Check className="w-3 h-3" />
                  <span>Passwords match</span>
                </div>
              )}
            </div>
          )}

          {/* Sign Up Only: Terms Checkbox */}
          {mode === "signup" && (
            <label className="flex items-start gap-3 cursor-pointer py-2">
              <div className="relative mt-0.5">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`w-5 h-5 rounded border transition-colors flex items-center justify-center ${
                    agreedToTerms
                      ? "bg-[#C9A84C] border-[#C9A84C]"
                      : "border-[#C9A84C]/30 bg-transparent"
                  }`}
                >
                  {agreedToTerms && <Check className="w-3 h-3 text-black" />}
                </div>
              </div>
              <span className="text-xs font-sans text-white/50 leading-relaxed">
                I agree to the{" "}
                <a href="#" className="text-[#C9A84C] hover:underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="#" className="text-[#C9A84C] hover:underline">
                  Privacy Policy
                </a>
              </span>
            </label>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={
              loading ||
              (mode === "signup" &&
                (!agreedToTerms || !passwordsMatch || !fullName))
            }
            className="w-full py-3 rounded-lg bg-[#C9A84C] text-black font-sans text-sm font-semibold uppercase tracking-widest transition-colors hover:bg-[#D4B460] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading
              ? "Please wait..."
              : mode === "signin"
                ? "Continue"
                : "Create Account"}
          </button>
        </form>

        {/* Bottom Link */}
        <p className="text-center text-xs font-sans uppercase tracking-widest text-white/50 mt-6">
          {mode === "signin" ? (
            <>
              {"Don't have an account? "}
              <button
                onClick={() => setMode("signup")}
                className="text-[#C9A84C] hover:underline"
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              {"Already have an account? "}
              <button
                onClick={() => setMode("signin")}
                className="text-[#C9A84C] hover:underline"
              >
                Sign In
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
