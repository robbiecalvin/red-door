import React, { useState } from "react";
import { Icon, type IconName } from "./Icon";

export const PLUS_STORIES = {
  filters: { icon: "filter", label: "Your type", title: "Less searching. More chemistry.", description: "Dial in age, position, and physical preferences. Save up to 10 searches and pick up where you left off.", action: "Find your type" },
  travel: { icon: "map", label: "Your next city", title: "Make a connection before you arrive.", description: "Move your discovery location with Travel mode. Explore the people around your next destination.", action: "Explore somewhere new" },
  album: { icon: "shield", label: "Your private side", title: "A little more. For the right people.", description: "Keep up to 20 photos in your private album. Choose who gets access, and revoke it whenever you want.", action: "Build your private album" },
  chats: { icon: "message", label: "Your conversations", title: "Keep the good conversations going.", description: "See when messages are read, pin up to 50 chats, and invite another member into a group conversation.", action: "Make room for more" },
  privacy: { icon: "shield", label: "Your space", title: "Browse on your terms.", description: "With off-grid browsing, your profile and location stay out of public discovery. Your existing conversations remain available. Basic location hiding stays free.", action: "Explore off-grid browsing" },
  profile: { icon: "user", label: "Your best side", title: "Give them more to be curious about.", description: "Show more of yourself with 12 gallery photos and a profile video. Keep up to 100 favorites close.", action: "Show more of you" }
} satisfies Record<string, {icon:IconName; label:string; title:string; description:string; action:string}>;
export type PlusFeature = keyof typeof PLUS_STORIES;
export function isPlusFeature(value: unknown): value is PlusFeature { return typeof value === "string" && Object.prototype.hasOwnProperty.call(PLUS_STORIES, value); }

export function PlusShowcase({ initialFeature = "filters" }: {initialFeature?: PlusFeature}): React.ReactElement {
  const [feature, setFeature] = useState<PlusFeature>(initialFeature);
  const story = PLUS_STORIES[feature];
  return <div className="rd-plus-showcase">
    <div className="rd-plus-story-tabs" aria-label="Explore Plus benefits">{Object.entries(PLUS_STORIES).map(([key, item]) => <button key={key} type="button" aria-pressed={key === feature} onClick={() => setFeature(key as PlusFeature)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</div>
    <section className="rd-plus-story" aria-live="polite" aria-label={story.label}>
      <div className={`rd-plus-preview rd-plus-preview-${feature}`} aria-hidden="true"><span className="rd-plus-preview-label">FEATURE PREVIEW</span>
      {feature === "filters" ? <><div className="rd-plus-demo-search"><Icon name="filter" /><strong>Your kind of connection</strong></div><div className="rd-plus-demo-chips"><span>Age 25–40</span><span>Position: top</span><span>Saved: My type</span></div><div className="rd-plus-demo-people">{["A", "J", "N"].map(letter => <span key={letter}><Icon name="user" /></span>)}</div></> : null}
      {feature === "travel" ? <><div className="rd-plus-demo-map"><i /><i /><i /><Icon name="map" /></div><div className="rd-plus-demo-search"><Icon name="map" /><strong>Next stop. New possibilities.</strong></div></> : null}
      {feature === "album" ? <><div className="rd-plus-demo-album">{[1,2,3].map(n => <span key={n}><Icon name={n === 2 ? "shield" : "user"} /></span>)}</div><div className="rd-plus-demo-search"><Icon name="shield" /><strong>Shared by invitation. Always your call.</strong></div></> : null}
      {feature === "chats" ? <div className="rd-plus-demo-chat"><span>Hey. Glad you said hello.</span><span>I was hoping you would.</span><small>Read ✓✓</small><div><Icon name="groups" />Invite another connection</div></div> : null}
      {feature === "privacy" ? <><div className="rd-plus-demo-album"><span><Icon name="shield" /></span></div><div className="rd-plus-demo-search"><strong>Off the grid. Still connected.</strong></div></> : null}
      {feature === "profile" ? <><div className="rd-plus-demo-profile"><Icon name="user" /><span>More photos.<br />More personality.</span></div><div className="rd-plus-demo-chips"><span>12 gallery photos</span><span>Profile video</span><span>100 favorites</span></div></> : null}
      </div><div className="rd-plus-story-copy"><h2>{story.title}</h2><p>{story.description}</p></div>
    </section>
  </div>;
}
export function PlusMembershipCard({active, onOpen}: {active:boolean; onOpen():void}): React.ReactElement {
  return <section className="rd-plus-membership"><div className="rd-eyebrow">RED DOOR <span>PLUS</span></div><h2>{active ? "Your Plus. Put it to use." : "Go beyond the first hello."}</h2><p>{active ? "Your next city, your favorite people, your private side. It’s all yours to explore." : "Find your type. Plan your next connection. Show a little more of yourself."}</p><div className="rd-plus-membership-perks"><span><Icon name="filter" />Fine-tune discovery</span><span><Icon name="map" />Travel mode</span><span><Icon name="shield" />20-photo private album</span></div><div className="rd-plus-membership-bottom"><strong>{active ? "Plus member" : "CAD $7.99"}<small>{active ? "Explore your benefits" : " / month"}</small></strong><button className="rd-btn primary" onClick={onOpen}>{active ? "Open your Plus" : "Discover Plus"}</button></div>{!active ? <small>Renews monthly until canceled. Manage cancellation in billing.</small> : null}</section>;
}
