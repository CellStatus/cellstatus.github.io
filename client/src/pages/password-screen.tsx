import React, { useState } from "react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export default function PasswordScreen({ onSuccess }: { onSuccess: (password: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleComplete(val: string) {
    setLoading(true);
    setError("");
    try {
      const healthUrl = API_BASE ? `${API_BASE}/api/health` : "/api/health";
      const res = await fetch(healthUrl, {
        method: "GET",
        headers: {
          "x-api-password": val,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        setError("Incorrect password");
        setValue("");
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (data?.ok) {
        setLoading(false);
        onSuccess(val);
      } else {
        setError("Incorrect password");
        setValue("");
        setLoading(false);
      }
    } catch (err) {
      setError("Network or server error");
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="bg-white rounded-lg shadow-lg p-8 flex flex-col items-center">
        <h2 className="mb-4 text-xl font-semibold">Enter Password</h2>
        <InputOTP
          maxLength={4}
          value={value}
          onChange={setValue}
          onComplete={handleComplete}
          containerClassName="mb-4"
          disabled={loading}
        >
          <InputOTPGroup>
            {[0, 1, 2, 3].map((i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>

        {loading && <div className="mt-2 text-sm">Verifying...</div>}
        {error && <div className="text-red-500 mt-2">{error}</div>}
      </div>
    </div>
  );
}
