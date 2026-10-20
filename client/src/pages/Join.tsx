import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Card, ErrorNote, Logo } from "../components/ui";
import { api } from "../lib/api";
import { useSession } from "../lib/session";

export function Join() {
  const { token = "" } = useParams();
  const { me, signIn } = useSession();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<{ workspace: string; role: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api<{ workspace: string; role: string; email: string }>(`/api/invites/${token}`).then(setInvite).catch((e) => setError(e.message)); }, [token]);

  const accept = async () => {
    try { const r = await api<{ token: string }>(`/api/invites/${token}/accept`, { method: "POST" }); await signIn(r.token); navigate("/"); } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-sage px-4">
      <Card className="w-full max-w-md space-y-4 p-7 text-center">
        <div className="flex justify-center"><Logo size={40} /></div>
        {error && <ErrorNote>{error}</ErrorNote>}
        {invite && (
          <>
            <h1 className="text-[22px] font-extrabold">Join {invite.workspace}</h1>
            <p className="text-mu">You've been invited as <b className="text-ink">{invite.role}</b> ({invite.email}).</p>
            {me ? (
              <Button className="w-full py-2.5" onClick={accept}>Join as {me.user.name}</Button>
            ) : (
              <Link to={`/login?next=${encodeURIComponent(`/join/${token}`)}`} className="block rounded-lg bg-ink py-2.5 font-semibold text-white">Sign in or try the demo to join</Link>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
