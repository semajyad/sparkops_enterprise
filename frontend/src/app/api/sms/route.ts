import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return NextResponse.json({ error: "SMS service not configured." }, { status: 503 });
  }

  let body: { job_id?: string; customer_mobile?: string; eta_minutes?: number; organization_name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { customer_mobile, eta_minutes, organization_name } = body;

  if (!customer_mobile) {
    return NextResponse.json({ error: "customer_mobile is required." }, { status: 400 });
  }

  const orgName = (organization_name ?? "").trim() || "TradeOps";
  const etaText = eta_minutes && eta_minutes > 0 ? `in approximately ${eta_minutes} minutes` : "shortly";
  const message = `Hi from ${orgName}. Your technician is on their way and expects to arrive ${etaText}.`;

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams({
      To: customer_mobile,
      From: fromNumber,
      Body: message,
    });

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!twilioResponse.ok) {
      const errBody = await twilioResponse.text();
      console.error("[SMS] Twilio error:", errBody);
      return NextResponse.json({ error: "SMS delivery failed." }, { status: 502 });
    }

    return NextResponse.json({ status: "sent" });
  } catch (err) {
    console.error("[SMS] Unexpected error:", err);
    return NextResponse.json({ error: "SMS service unavailable." }, { status: 503 });
  }
}
