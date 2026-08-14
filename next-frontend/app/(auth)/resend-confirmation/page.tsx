import { Metadata } from "next";
import { ResendConfirmationForm } from "@/components/auth/resend-confirmation-form";

export const metadata: Metadata = {
  title: "Resend Confirmation Email | StreamTube",
  description: "Resend your StreamTube account confirmation email.",
};

export default function ResendConfirmationPage() {
  return <ResendConfirmationForm />;
}
