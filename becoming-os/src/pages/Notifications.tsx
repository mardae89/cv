import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useFeedback } from "@/components/feedback";
import { Button, Card, cx, EmptyState, Notice, PageHeader } from "@/components/ui";
import { useStore } from "@/data/store";
import { errorMessage } from "@/lib/format";

export default function Notifications() {
  const { notifications, update } = useStore();
  const { toast } = useFeedback();
  const unread = notifications.filter((n) => !n.read_at);
  const markRead = async (ids: string[]) => {
    if (!ids.length) return;
    const read_at = new Date().toISOString();
    try {
      // Started together so the changes are stored in one write.
      await Promise.all(ids.map((id) => update("notifications", id, { read_at })));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };
  const clear = async () => {
    try {
      // Kept (hidden) rather than deleted, so a reminder for the current period doesn't come back.
      const cleared_at = new Date().toISOString();
      await Promise.all(notifications.filter((n) => n.read_at).map((n) => update("notifications", n.id, { cleared_at })));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Notification centre" title="Reminders"
        action={<div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={!unread.length} onClick={() => markRead(unread.map((n) => n.id))}>Mark all read</Button>
          <Button variant="ghost" size="sm" disabled={notifications.length === unread.length} onClick={clear}>Clear read</Button>
        </div>} />
      <Notice>
        Reminders are worked out when you open BECOMING OS and are listed here. Nothing is sent to your phone or email, so check back here.
        Choose which reminders you get in <Link to="/settings#reminders" className="link">Settings</Link>.
      </Notice>
      {notifications.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-hair">
            {notifications.map((n) => (
              <li key={n.id} className={cx("flex gap-3 px-5 py-4", !n.read_at && "bg-gold-wash/60")}>
                <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-line" : "bg-gold")} />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] text-bone">{n.title}</div>
                  {n.body && <p className="mt-0.5 text-[12.5px] text-mute">{n.body}</p>}
                  <div className="mt-1.5 flex gap-4 text-[11.5px] text-faint">
                    <span>{new Date(n.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    {n.link && <Link to={n.link} onClick={() => !n.read_at && markRead([n.id])} className="text-gold">Open</Link>}
                    {!n.read_at && <button onClick={() => markRead([n.id])} className="hover:text-bone">Mark read</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : <EmptyState icon={<Bell className="h-6 w-6" />} title="All clear">Reminders and unlocked milestones will show up here.</EmptyState>}
    </div>
  );
}
