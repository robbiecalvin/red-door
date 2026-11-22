import React from "react";
import back from "../assets/interface/back.webp";
import block from "../assets/interface/block.webp";
import chatgrid from "../assets/interface/chatgrid.webp";
import chatgridselected from "../assets/interface/chatgridselected.webp";
import downloadapp from "../assets/interface/downloadapp.webp";
import explore from "../assets/interface/explore.webp";
import exploreselected from "../assets/interface/exploreselected.webp";
import filters from "../assets/interface/filters.webp";
import filterson from "../assets/interface/filterson.webp";
import flame from "../assets/interface/flame.webp";
import flamed from "../assets/interface/flamed.webp";
import groups from "../assets/interface/groups.webp";
import groupsselected from "../assets/interface/groupsselected.webp";
import inbox from "../assets/interface/inbox.webp";
import inboxselected from "../assets/interface/inboxselected.webp";
import live from "../assets/interface/live.webp";
import liveon from "../assets/interface/liveon.webp";
import map from "../assets/interface/map.webp";
import mapselected from "../assets/interface/mapselected.webp";
import postings from "../assets/interface/postings.webp";
import postingsselected from "../assets/interface/postingsselected.webp";
import rightnow from "../assets/interface/rightnow.webp";
import rightnowon from "../assets/interface/rightnowon.webp";
import settings from "../assets/interface/settings.webp";
import settingsselected from "../assets/interface/settingsselected.webp";
import star from "../assets/interface/star.webp";
import starred from "../assets/interface/starred.webp";
import travel from "../assets/interface/travel.webp";
import travelmodeon from "../assets/interface/travelmodeon.webp";
import updateapp from "../assets/interface/updateapp.webp";

type DrawnIconName = "board" | "user" | "book" | "logout" | "shield" | "check" | "shopping-bag" | "plus";
const paths: Record<DrawnIconName, React.ReactNode> = {
  "shopping-bag": <><path d="M5 8h14l2 13H3L5 8Z" /><path d="M9 10V6a3 3 0 0 1 6 0v4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12 4 4L19 6" />,
  board: <><rect x="4" y="4" width="16" height="17" rx="3" /><path d="M8 3v3M16 3v3M8 11h8M8 15h5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  book: <><path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1v15" /></>,
  logout: <><path d="M9 3H4v18h5M9 12h12m-5-5 5 5-5 5" /></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" /><path d="m8 12 3 3 5-6" /></>
};
const images = {
  back: [back],
  block: [block],
  grid: [chatgrid, chatgridselected],
  download: [downloadapp],
  explore: [explore, exploreselected],
  filter: [filters, filterson],
  flame: [flame, flamed],
  groups: [groups, groupsselected],
  message: [inbox, inboxselected],
  live: [live, liveon],
  map: [map, mapselected],
  postings: [postings, postingsselected],
  lightning: [rightnow, rightnowon],
  settings: [settings, settingsselected],
  star: [star, starred],
  travel: [travel, travelmodeon],
  update: [updateapp],
};

export type IconName = DrawnIconName | keyof typeof images;

export function Icon({ name, className, active = false }: { name: IconName; className?: string; active?: boolean }): React.ReactElement {
  if (name in images) {
    const [standard, selected] = images[name as keyof typeof images];
    return <img className={`rd-art-icon ${className ?? ""}`} src={active && selected ? selected : standard}
      width={24} height={24} alt="" aria-hidden="true" draggable={false} />;
  }
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name as DrawnIconName]}</svg>;
}
