import { Card } from "@/components/ui/card"

export const metadata = {
  title: "Terms of Service | StreamTube",
  description: "Terms of service and conditions of use for StreamTube.",
}

export default function TermsPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6 py-10">
      <Card className="w-full max-w-[800px] gap-6 px-8 py-10">
        <h1 className="text-h1 text-foreground mb-6">Termos de Serviço</h1>
        
        <div className="flex flex-col gap-6 text-body-md text-foreground">
          <section>
            <h2 className="text-h2 mb-4">1. Aceitação dos Termos</h2>
            <p className="text-muted-foreground mb-3">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
            </p>
            <p className="text-muted-foreground">
              Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
            </p>
          </section>

          <section>
            <h2 className="text-h2 mb-4">2. Uso da Plataforma</h2>
            <p className="text-muted-foreground mb-3">
              Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.
            </p>
            <p className="text-muted-foreground">
              Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.
            </p>
          </section>

          <section>
            <h2 className="text-h2 mb-4">3. Upload e Direitos Autorais</h2>
            <p className="text-muted-foreground mb-3">
              Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.
            </p>
            <p className="text-muted-foreground">
              Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur.
            </p>
          </section>

          <section>
            <h2 className="text-h2 mb-4">4. Limitação de Responsabilidade</h2>
            <p className="text-muted-foreground">
              At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga.
            </p>
          </section>
        </div>
      </Card>
    </main>
  )
}
