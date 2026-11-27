import { redirect } from "next/navigation";

// Pricing & Community section is disabled and hidden for now.
export default function PricingPage() {
  redirect("/forecast");
}
