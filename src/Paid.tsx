/**
 * Where Stripe sends a customer after a successful payment.
 *
 * It has to work for someone who is **not signed in**, because they almost
 * never are — they bought before they had an account, and the webhook created
 * it moments ago from the email Stripe collected. Sending them to /dashboard
 * would have shown "You are not logged in", which reads as *the payment did
 * not work* at the exact moment a customer is most anxious about that.
 *
 * So this page confirms the payment, says what happens next, and points at the
 * inbox where their sign-in link is already waiting.
 */
export default function Paid() {
  const sessionId = new URLSearchParams(window.location.search).get("session");

  return (
    <div className="container">
      <div className="nav">
        <div className="brand">Down Dirty 84</div>
        <button className="secondary" onClick={() => (window.location.href = "/login")}>
          Sign in
        </button>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ marginTop: 0 }}>Payment received. Thank you.</h2>
        <p className="small">
          We have emailed you a receipt and a sign-in link. Open that link and you can upload your
          datalog straight away — no password to set up.
        </p>
        <p className="small" style={{ opacity: 0.75 }}>
          Check spam if it is not there in a minute or two. The link expires, but you can always
          request a new one from the sign-in page; your job is already on your account either way.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>What happens next</h3>
        <ol className="small" style={{ paddingLeft: 18, marginBottom: 0 }}>
          <li>You upload a datalog</li>
          <li>It is parsed and checked against safety and drivability rules</li>
          <li>Suggested changes are calculated, with a confidence on each one</li>
          <li>
            <b>A person reviews and releases them.</b> That never happens automatically — it is
            what stands between a wrong number and your engine
          </li>
          <li>You get an email with the change list and a CSV</li>
        </ol>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button onClick={() => (window.location.href = "/login")}>Sign in to upload</button>
        <button className="secondary" onClick={() => (window.location.href = "/buy")}>
          Back to services
        </button>
      </div>

      {sessionId && (
        // Useful to a customer emailing about a payment, and to whoever answers.
        <p className="small" style={{ opacity: 0.5, marginTop: 20 }}>
          Reference: {sessionId}
        </p>
      )}
    </div>
  );
}
