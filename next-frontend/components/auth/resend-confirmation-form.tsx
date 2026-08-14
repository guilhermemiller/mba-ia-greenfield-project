"use client";

import { useTransition, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const formSchema = z.object({
  email: z.string().email("Formato de e-mail inválido"),
});

type FormData = z.infer<typeof formSchema>;

export function ResendConfirmationForm() {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/resend-confirmation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (response.ok) {
          setSuccess(true);
          return;
        }

        const result = await response.json();
        setError("root", {
          message: result.message || "Erro ao reenviar o e-mail",
        });
      } catch (err) {
        if (err) {
          console.error(err);
        }
        setError("root", {
          message: "Ocorreu um erro inesperado. Tente novamente mais tarde.",
        });
      }
    });
  };

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="mb-8">
        <Link
          href="/login"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para o login
        </Link>
      </div>

      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Reenviar confirmação</CardTitle>
          <CardDescription>
            Insira seu e-mail cadastrado e enviaremos um novo link de confirmação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="bg-success/15 text-success border-success/30 p-4 border rounded-[var(--radius-1)]">
              Se o e-mail existir e não estiver confirmado, você receberá um novo link em instantes.
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {errors.root && (
                <div className="p-3 text-sm rounded-[var(--radius-0-5)] bg-destructive/15 text-destructive font-medium border border-destructive/30">
                  {errors.root.message}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  {...register("email")}
                  className={errors.email ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Enviando..." : "Enviar novo link"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
