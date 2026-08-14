import { UploadForm } from "@/components/videos/upload-form";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Upload de Vídeo - StreamTube",
};

export default async function UploadPage() {
  const session = await getSession();

  if (!session.isLoggedIn) {
    redirect("/login?callbackUrl=/upload");
  }

  return (
    <div className="container mx-auto py-12 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Upload de Vídeo</h1>
        <p className="text-muted-foreground mt-2">
          Envie seus vídeos para a plataforma. O processamento ocorrerá em segundo plano.
        </p>
      </div>
      <UploadForm />
    </div>
  );
}
