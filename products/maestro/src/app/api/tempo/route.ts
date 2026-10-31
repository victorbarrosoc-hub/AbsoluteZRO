import { getTempo, postTempo } from "@/lib/tempo/rota";

/** O cronômetro de tarefas: o estado e os resumos (GET), iniciar, pausar, ajustar e os tipos de vídeo (POST). */
export function GET(req: Request) {
  return getTempo(req);
}

export function POST(req: Request) {
  return postTempo(req);
}
