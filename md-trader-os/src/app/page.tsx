import { redirect } from "next/navigation";

/** The app is the product. Opening it opens the dashboard. */
export default function Home() {
  redirect("/dashboard");
}
