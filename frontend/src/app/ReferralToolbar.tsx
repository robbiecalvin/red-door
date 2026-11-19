import React, { useEffect, useState } from "react";
import { referralCurrency, type ReferralSummary } from "../../../shared/referralSummary";
import type { apiClient, Session } from "./api";

export function ReferralToolbar({ api, session, onOpen }: {
  api: ReturnType<typeof apiClient>;
  session: Session;
  onOpen(): void;
}) {
  const [summary, setSummary] = useState<{ token: string; data: ReferralSummary } | null>(null);
  const token = session.sessionToken;
  useEffect(() => {
    if (!session.userId || !session.ageVerified) return;
    let active = true;
    const refresh = () => void api.memberRequest<ReferralSummary>(token, "/membership/referrals")
      .then(data => { if (active) setSummary({ token, data }); })
      .catch(() => { if (active) setSummary(null); });
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("rd:plus-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("rd:plus-changed", refresh);
    };
  }, [api, token, session.userId, session.ageVerified]);

  const data = summary?.token === token ? summary.data : null;
  if (!data?.priority) return null;
  return <button type="button" className="rd-btn rd-referral-toolbar" onClick={onOpen}>
    <span>Referrals <strong>{data.monthlyReferrals} this month · {data.lifetimeReferrals} lifetime</strong></span>
    <span>Earnings <strong>{referralCurrency.format(data.monthlyEarningsCents / 100)} this month · {referralCurrency.format(data.unpaidCents / 100)} unpaid</strong></span>
  </button>;
}
