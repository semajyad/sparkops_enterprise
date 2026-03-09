import { redirect } from "next/navigation";

export default function HomeAliasPage(): never {
  redirect("/dashboard");
}
