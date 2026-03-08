import { redirect } from "next/navigation";

export default function SignupPage(): never {
  redirect("/login?mode=signup");
}
