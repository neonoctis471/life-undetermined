export async function GET(): Promise<Response> {
  return Response.json({
    data: { status: "ok" },
    meta: { service: "zhihu-five-years-game" },
  });
}
