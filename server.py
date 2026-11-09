"""
Installation Tracker - local server (Python standard library only, no installs needed).

Run:   python server.py            -> http://localhost:8080
       python server.py --demo     -> same, but loads sample data first (only if DB is empty)
       python server.py --port 9000
"""
import json
import os
import re
import smtplib
import sqlite3
import ssl
import sys
import threading
import time
import calendar
from datetime import date, datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, "data", "tracker.db")
STATIC = os.path.join(BASE, "static")
REPORTS = os.path.join(BASE, "reports")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(REPORTS, exist_ok=True)

FREE_SERVICE_MONTHS = 3
# Before work starts: Allotted -> (kickoff meeting) Kickoff Done -> (site readiness check) Site Ready / Site Not Ready
#   -> (finished goods delivered to site) Partly Received / Goods Received -> first daily update -> In Progress
PRESTART = ("Allotted", "Kickoff Done", "Site Not Ready", "Site Ready", "Partly Received", "Goods Received")
ACTIVE = PRESTART + ("In Progress", "On Hold", "Rework")
STATUSES = ["Allotted", "Kickoff Done", "Site Not Ready", "Site Ready", "Partly Received", "Goods Received",
            "In Progress", "On Hold", "Rework", "Installation Completed", "Inspection Passed", "Handed Over", "Closed"]
GOODS_OPEN = ("Site Ready", "Partly Received", "Goods Received", "In Progress", "On Hold", "Rework")  # deliveries can be recorded
KICKOFF_DUE_DAYS = 3   # kickoff is flagged late this many days after allotment
KICKOFF_MODES = ["At site", "Office / showroom", "Phone / video call"]
KICKOFF_CHECKLIST = [
    "Scope & approved drawings confirmed", "Start & target dates agreed",
    "Site readiness requirements explained to customer", "Material delivery, storage & site access agreed",
    "Responsibilities agreed (ours vs customer / other contractors)", "Contact persons & escalation shared",
    "Customer requests & concerns noted",
]
SITE_CHECKLIST = [
    ("Civil & finishing", ["Flooring complete & cured", "Walls plastered, putty & primer done", "False ceiling complete",
                           "No wet work in progress in the area", "Walls dry - no dampness or seepage"]),
    ("Electrical", ["Electrical points as per drawing", "Wiring complete, wires left out at points",
                    "Power supply available for tools", "Lighting working in work area"]),
    ("Plumbing & gas", ["Water inlet & drain points as per drawing", "Plumbing pressure-tested, no leaks",
                        "Gas pipeline point ready"]),
    ("Measurements", ["Site measurements match production drawing", "Walls plumb & floor level within tolerance",
                      "Openings, niches & beams match drawing"]),
    ("Access & logistics", ["Site clear of debris & other material", "Lift / staircase route OK for panels",
                            "Safe, dry storage space for material", "Work timings, passes & permissions sorted",
                            "Key / site access arranged"]),
    ("Coordination", ["No other contractors in the area during installation", "Appliances delivered or models confirmed",
                      "Customer / site in-charge available on start date"]),
    ("Safety", ["No exposed live wires or open shafts", "Adequate ventilation & lighting"]),
]
SITE_ITEMS = [i for _, items in SITE_CHECKLIST for i in items]
SITE_ANSWERS = ("Ready", "Not Ready", "N/A")

DB_LOCK = threading.RLock()

# --------------------------------------------------------------------------- DB

SCHEMA = """
CREATE TABLE IF NOT EXISTS members(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, role TEXT DEFAULT 'Installer', city TEXT, phone TEXT, email TEXT,
  active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS projects(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE, name TEXT NOT NULL, customer_name TEXT, customer_phone TEXT, customer_email TEXT,
  address TEXT, city TEXT, assigned_to INTEGER REFERENCES members(id),
  start_date TEXT, target_date TEXT, status TEXT DEFAULT 'Allotted', progress INTEGER DEFAULT 0,
  remarks TEXT, completed_date TEXT, handover_date TEXT, service_end_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS updates(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, member_id INTEGER,
  update_date TEXT, progress INTEGER, status TEXT, work_done TEXT, issues TEXT, next_plan TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS inspections(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, inspector TEXT,
  inspection_date TEXT, checklist TEXT, result TEXT, remarks TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS handovers(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER UNIQUE REFERENCES projects(id) ON DELETE CASCADE, handover_date TEXT,
  received_by TEXT, receiver_phone TEXT, documents TEXT, remarks TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS feedback(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, feedback_date TEXT,
  quality INTEGER, timeliness INTEGER, team_behaviour INTEGER, cleanliness INTEGER, overall INTEGER,
  recommend TEXT, comments TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS services(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, visit_no INTEGER,
  service_type TEXT DEFAULT 'Scheduled', scheduled_date TEXT, status TEXT DEFAULT 'Scheduled',
  technician_id INTEGER, completed_date TEXT, issue TEXT, action_taken TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS kickoffs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER UNIQUE REFERENCES projects(id) ON DELETE CASCADE, meeting_date TEXT, mode TEXT,
  our_attendees TEXT, customer_attendees TEXT, checklist TEXT, mom TEXT, customer_requests TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS site_checks(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, check_date TEXT, checked_by TEXT,
  checklist TEXT, result TEXT, pending_items TEXT, expected_ready_date TEXT, remarks TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS goods_receipts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, receipt_date TEXT, dc_no TEXT, vehicle_no TEXT,
  received_by TEXT, customer_rep TEXT, items TEXT, qty_sent INTEGER, qty_received INTEGER, qty_short INTEGER,
  qty_damaged INTEGER, all_received INTEGER DEFAULT 0, remarks TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS report_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT, generated_at TEXT, trigger TEXT, recipients TEXT, status TEXT, file TEXT, message TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS email_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_at TEXT, kind TEXT, recipients TEXT, subject TEXT, status TEXT, message TEXT, file TEXT);
"""
EMAIL_RE = re.compile(r"^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$")
DATA_VERSION = [int(time.time())]

DEFAULT_SETTINGS = {
    "company_name": "Installation Tracker",
    "manager_emails": "",
    "report_time": "19:00",
    "auto_report_enabled": "1",
    "smtp_host": "",
    "smtp_port": "587",
    "smtp_security": "starttls",   # starttls | ssl | none
    "smtp_user": "",
    "smtp_password": "",
    "smtp_from": "",
    "last_auto_report_date": "",
    "member_daily_mail": "1",      # each member gets their own evening summary
    "notify_allotment": "1",       # email the member when a project is allotted to them
    "app_url": "http://localhost:8080",
}


def connect():
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


CON = connect()


def init_db():
    with DB_LOCK:
        CON.executescript(SCHEMA)
        for k, v in DEFAULT_SETTINGS.items():
            CON.execute("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)", (k, v))
        cols = [r[1] for r in CON.execute("PRAGMA table_info(members)").fetchall()]
        if "daily_summary" not in cols:
            CON.execute("ALTER TABLE members ADD COLUMN daily_summary INTEGER DEFAULT 0")
            CON.execute("UPDATE members SET daily_summary=1 WHERE role='Manager'")
        pcols = [r[1] for r in CON.execute("PRAGMA table_info(projects)").fetchall()]
        if "fitment_check" not in pcols:
            CON.execute("ALTER TABLE projects ADD COLUMN fitment_check TEXT DEFAULT 'Not Done'")
        if "goods_status" not in pcols:   # Pending | Partial | Complete
            CON.execute("ALTER TABLE projects ADD COLUMN goods_status TEXT DEFAULT 'Pending'")
        # projects allotted with fitment already done (before the kickoff/site-readiness steps existed) are ready to start
        CON.execute("UPDATE projects SET status='Site Ready' WHERE status='Allotted' AND fitment_check='Done'")
        CON.commit()


def q(sql, params=()):
    with DB_LOCK:
        return [dict(r) for r in CON.execute(sql, params).fetchall()]


def q1(sql, params=()):
    rows = q(sql, params)
    return rows[0] if rows else None


def ex(sql, params=()):
    with DB_LOCK:
        cur = CON.execute(sql, params)
        CON.commit()
        if cur.rowcount and not sql.lstrip().upper().startswith(("INSERT INTO EMAIL_LOG", "INSERT INTO REPORT_LOG")):
            DATA_VERSION[0] += 1
        return cur.lastrowid


def get_settings():
    return {r["key"]: r["value"] for r in q("SELECT key,value FROM settings")}


def set_setting(k, v):
    ex("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, str(v)))


# ----------------------------------------------------------------------- helpers

def today():
    return date.today().isoformat()


def add_months(d, n):
    if isinstance(d, str):
        d = date.fromisoformat(d)
    m = d.month - 1 + n
    y = d.year + m // 12
    m = m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1])).isoformat()


def next_code():
    yr = date.today().year
    row = q1("SELECT code FROM projects WHERE code LIKE ? ORDER BY id DESC LIMIT 1", (f"INS-{yr}-%",))
    n = int(row["code"].split("-")[-1]) + 1 if row else 1
    return f"INS-{yr}-{n:04d}"


PROJECT_SELECT = """
SELECT p.*, m.name AS member_name, m.city AS member_city,
  (SELECT MAX(update_date) FROM updates u WHERE u.project_id=p.id) AS last_update,
  (SELECT overall FROM feedback f WHERE f.project_id=p.id ORDER BY id DESC LIMIT 1) AS csat,
  (SELECT meeting_date FROM kickoffs k WHERE k.project_id=p.id) AS kickoff_date,
  (SELECT check_date FROM site_checks sc WHERE sc.project_id=p.id ORDER BY sc.id DESC LIMIT 1) AS site_check_date,
  (SELECT pending_items FROM site_checks sc WHERE sc.project_id=p.id ORDER BY sc.id DESC LIMIT 1) AS site_pending,
  (SELECT expected_ready_date FROM site_checks sc WHERE sc.project_id=p.id ORDER BY sc.id DESC LIMIT 1) AS site_expected,
  (SELECT COUNT(*) FROM goods_receipts g WHERE g.project_id=p.id) AS goods_deliveries,
  (SELECT MAX(receipt_date) FROM goods_receipts g WHERE g.project_id=p.id) AS goods_last_date,
  (SELECT COALESCE(SUM(qty_short),0) FROM goods_receipts g WHERE g.project_id=p.id) AS goods_short,
  (SELECT COALESCE(SUM(qty_damaged),0) FROM goods_receipts g WHERE g.project_id=p.id) AS goods_damaged
FROM projects p LEFT JOIN members m ON m.id=p.assigned_to
"""


def decorate(p, t=None):
    t = t or today()
    p["overdue"] = bool(p.get("target_date") and p["status"] in ACTIVE and p["target_date"] < t)
    p["updated_today"] = p.get("last_update") == t
    allotted_on = (p.get("created_at") or t)[:10]
    p["days_since_allotment"] = (date.fromisoformat(t) - date.fromisoformat(allotted_on)).days
    p["kickoff_late"] = p["status"] == "Allotted" and p["days_since_allotment"] >= KICKOFF_DUE_DAYS
    p["goods_pending"] = p["status"] in ACTIVE and p.get("goods_status") == "Partial"
    p["site_expected_passed"] = bool(p["status"] == "Site Not Ready" and p.get("site_expected") and p["site_expected"] < t)
    if p.get("service_end_date"):
        p["service_days_left"] = (date.fromisoformat(p["service_end_date"]) - date.fromisoformat(t)).days
    else:
        p["service_days_left"] = None
    return p


def list_projects(filters=None):
    filters = filters or {}
    where, params = [], []
    if filters.get("member"):
        where.append("p.assigned_to=?"); params.append(int(filters["member"]))
    if filters.get("city"):
        where.append("p.city=?"); params.append(filters["city"])
    if filters.get("status"):
        where.append("p.status=?"); params.append(filters["status"])
    sql = PROJECT_SELECT + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY p.id DESC"
    return [decorate(p) for p in q(sql, params)]


def get_project(pid):
    p = q1(PROJECT_SELECT + " WHERE p.id=?", (pid,))
    if not p:
        return None
    decorate(p)
    p["updates"] = q("""SELECT u.*, m.name AS member_name FROM updates u LEFT JOIN members m ON m.id=u.member_id
                        WHERE project_id=? ORDER BY update_date DESC, id DESC""", (pid,))
    p["kickoff"] = q1("SELECT * FROM kickoffs WHERE project_id=?", (pid,))
    if p["kickoff"]:
        p["kickoff"]["checklist"] = json.loads(p["kickoff"]["checklist"] or "{}")
    p["site_checks"] = q("SELECT * FROM site_checks WHERE project_id=? ORDER BY id DESC", (pid,))
    for c in p["site_checks"]:
        c["checklist"] = json.loads(c["checklist"] or "{}")
    p["goods"] = q("SELECT * FROM goods_receipts WHERE project_id=? ORDER BY receipt_date DESC, id DESC", (pid,))
    for g in p["goods"]:
        g["items"] = json.loads(g["items"] or "[]")
    p["inspections"] = q("SELECT * FROM inspections WHERE project_id=? ORDER BY id DESC", (pid,))
    for i in p["inspections"]:
        i["checklist"] = json.loads(i["checklist"] or "{}")
    p["handover"] = q1("SELECT * FROM handovers WHERE project_id=?", (pid,))
    p["feedback"] = q("SELECT * FROM feedback WHERE project_id=? ORDER BY id DESC", (pid,))
    p["services"] = q("""SELECT s.*, m.name AS technician_name FROM services s LEFT JOIN members m ON m.id=s.technician_id
                         WHERE project_id=? ORDER BY scheduled_date""", (pid,))
    return p


def run_maintenance():
    """Close projects whose free-service window has ended; mark past-due scheduled visits as Missed."""
    t = today()
    ex("UPDATE projects SET status='Closed' WHERE status='Handed Over' AND service_end_date < ?", (t,))
    ex("""UPDATE services SET status='Missed' WHERE status='Scheduled' AND scheduled_date < ?
          AND scheduled_date < date(?, '-7 day')""", (t, t))


# --------------------------------------------------------------------- dashboard

def dashboard(filters):
    t = today()
    projects = list_projects(filters)
    members = q("SELECT * FROM members WHERE active=1 ORDER BY name")
    if filters.get("member"):
        members = [m for m in members if str(m["id"]) == str(filters["member"])]
    if filters.get("city"):
        members = [m for m in members if m["city"] == filters["city"]
                   or any(p["assigned_to"] == m["id"] for p in projects)]

    def stage(p):
        s = p["status"]
        if s in PRESTART: return "Not started"
        if s in ("In Progress", "On Hold", "Rework"): return "In progress"
        if s in ("Installation Completed", "Inspection Passed"): return "Inspection / handover"
        return "Handed over"

    kpi = {
        "total": len(projects),
        "active": sum(p["status"] in ACTIVE for p in projects),
        "overdue": sum(p["overdue"] for p in projects),
        "on_hold": sum(p["status"] == "On Hold" for p in projects),
        "pending_inspection": sum(p["status"] in ("Installation Completed",) for p in projects),
        "pending_handover": sum(p["status"] == "Inspection Passed" for p in projects),
        "in_free_service": sum(p["status"] == "Handed Over" for p in projects),
        "closed": sum(p["status"] == "Closed" for p in projects),
        "no_update_today": sum(p["status"] in ("In Progress", "Rework") and not p["updated_today"] for p in projects),
        "kickoff_pending": sum(p["status"] == "Allotted" for p in projects),
        "kickoff_late": sum(p["kickoff_late"] for p in projects),
        "site_check_pending": sum(p["status"] == "Kickoff Done" for p in projects),
        "site_not_ready": sum(p["status"] == "Site Not Ready" for p in projects),
        "awaiting_goods": sum(p["status"] == "Site Ready" for p in projects),
        "goods_pending": sum(p["goods_pending"] for p in projects),
        "ready_to_start": sum(p["status"] in ("Partly Received", "Goods Received") for p in projects),
    }
    pids = [p["id"] for p in projects]
    fb = q("SELECT * FROM feedback") if pids else []
    fb = [f for f in fb if f["project_id"] in pids]
    kpi["csat"] = round(sum(f["overall"] or 0 for f in fb) / len(fb), 2) if fb else None
    kpi["feedback_count"] = len(fb)

    by_member = []
    for m in members:
        mp = [p for p in projects if p["assigned_to"] == m["id"]]
        stages = {s: 0 for s in ("Not started", "In progress", "Inspection / handover", "Handed over")}
        for p in mp:
            stages[stage(p)] += 1
        ratings = [f["overall"] for f in fb if any(p["id"] == f["project_id"] for p in mp)]
        by_member.append({
            "id": m["id"], "name": m["name"], "city": m["city"], "role": m["role"], "email": m["email"],
            "total": len(mp), "stages": stages,
            "working": sum(p["status"] in ("In Progress", "Rework") for p in mp),
            "updated_today": sum(p["status"] in ("In Progress", "Rework") and p["updated_today"] for p in mp),
            "active": sum(p["status"] in ACTIVE for p in mp),
            "overdue": sum(p["overdue"] for p in mp),
            "csat": round(sum(ratings) / len(ratings), 1) if ratings else None,
            "projects": [{"id": p["id"], "code": p["code"], "name": p["name"], "city": p["city"],
                          "status": p["status"], "progress": p["progress"], "overdue": p["overdue"],
                          "target_date": p["target_date"], "updated_today": p["updated_today"]} for p in mp],
        })

    cities = sorted({p["city"] for p in projects if p["city"]})
    by_city = []
    for c in cities:
        cp = [p for p in projects if p["city"] == c]
        by_city.append({"city": c, "counts": {s: sum(p["status"] == s for p in cp) for s in STATUSES},
                        "total": len(cp), "overdue": sum(p["overdue"] for p in cp)})

    week = (date.today() + timedelta(days=7)).isoformat()
    services_due = q("""SELECT s.*, p.code, p.name AS project_name, p.city, p.customer_name, p.customer_phone,
                        m.name AS technician_name FROM services s JOIN projects p ON p.id=s.project_id
                        LEFT JOIN members m ON m.id=s.technician_id
                        WHERE s.status='Scheduled' AND s.scheduled_date <= ? ORDER BY s.scheduled_date""", (week,))
    services_due = [s for s in services_due if s["project_id"] in pids]
    for s in services_due:
        s["overdue"] = s["scheduled_date"] < t

    return {
        "today": t, "kpi": kpi, "by_member": by_member, "by_city": by_city,
        "overdue": [p for p in projects if p["overdue"]],
        "pending_inspection": [p for p in projects if p["status"] == "Installation Completed"],
        "pending_handover": [p for p in projects if p["status"] == "Inspection Passed"],
        "kickoff_pending": [p for p in projects if p["status"] == "Allotted"],
        "site_not_ready": [p for p in projects if p["status"] == "Site Not Ready"],
        "awaiting_goods": [p for p in projects if p["status"] == "Site Ready"],
        "goods_pending": [p for p in projects if p["goods_pending"]],
        "services_due": services_due,
        "all_cities": [r["city"] for r in q("SELECT DISTINCT city FROM projects WHERE city<>'' ORDER BY city")],
    }


# ------------------------------------------------------------------- email + reports

BRAND = "#1f5fbf"


def _e(v):
    return escape(str(v)) if v not in (None, "") else "-"


def _fmt(d):
    try:
        return date.fromisoformat(d).strftime("%d %b %Y")
    except Exception:
        return _e(d)


def email_shell(title, subtitle, body, s):
    url = s.get("app_url") or "http://localhost:8080"
    company = _e(s.get("company_name") or "Installation Tracker")
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>{_e(title)}</title></head>
<body style="margin:0;background:#f2f4f8;font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#14213d;font-size:14px">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f8;padding:24px 0"><tr><td align="center">
<table width="760" cellpadding="0" cellspacing="0" style="max-width:760px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3e7ee">
<tr><td style="background:{BRAND};padding:22px 28px;color:#fff">
  <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">{company}</div>
  <div style="font-size:22px;font-weight:600;margin-top:4px">{_e(title)}</div>
  <div style="font-size:13px;opacity:.9;margin-top:4px">{subtitle}</div></td></tr>
<tr><td style="padding:22px 28px">{body}
  <div style="margin:26px 0 6px"><a href="{escape(url)}" style="background:{BRAND};color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">Open live dashboard</a></div>
</td></tr>
<tr><td style="padding:14px 28px;background:#f7f8fb;color:#7a8396;font-size:12px">Sent automatically by Installation Tracker &middot; {datetime.now().strftime('%d %b %Y, %I:%M %p')}</td></tr>
</table></td></tr></table></body></html>"""


def _kpis(items):
    cells = "".join(
        f'<td style="padding:4px"><div style="border:1px solid #e3e7ee;border-radius:10px;padding:10px 12px;'
        f'background:#fafbfd"><div style="font-size:11px;color:#6b7489">{label}</div>'
        f'<div style="font-size:22px;font-weight:700;color:{color}">{val}</div></div></td>'
        for label, val, color in items)
    return f'<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 -4px 8px"><tr>{cells}</tr></table>'


def _h(t):
    return f'<div style="font-size:15px;font-weight:600;margin:22px 0 8px;color:#14213d">{t}</div>'


def _table(headers, rows, empty="Nothing to show"):
    if not rows:
        return f'<div style="color:#7a8396;padding:6px 0">{empty}</div>'
    th = "".join(f'<th align="left" style="padding:7px 8px;background:#f2f4f8;font-size:12px;color:#4a5468;'
                 f'border-bottom:1px solid #dfe3ea">{h}</th>' for h in headers)
    body = "".join("<tr>" + "".join(f'<td style="padding:7px 8px;border-bottom:1px solid #eef0f4;vertical-align:top">{c}</td>'
                                    for c in r) + "</tr>" for r in rows)
    return f'<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">{th and "<tr>"+th+"</tr>"}{body}</table>'


def _status(p):
    colors = {"Allotted": "#5b6b85", "Kickoff Done": "#0e7490", "Site Not Ready": "#b42318", "Site Ready": "#0f7a55",
              "Partly Received": "#a86b00", "Goods Received": "#0f7a55", "In Progress": "#1f5fbf", "On Hold": "#a86b00", "Rework": "#c2410c",
              "Installation Completed": "#0f7a55", "Inspection Passed": "#0f7a55", "Handed Over": "#5b3fc4", "Closed": "#6b7489"}
    c = colors.get(p["status"], "#333")
    tag = f'<span style="color:{c};font-weight:600">{_e(p["status"])}</span>'
    if p.get("overdue"):
        tag += ' <span style="background:#fde2e2;color:#b42318;padding:1px 6px;border-radius:9px;font-size:11px;font-weight:600">OVERDUE</span>'
    return tag


def _bar(v):
    v = int(v or 0)
    return (f'<table cellpadding="0" cellspacing="0" style="width:90px;display:inline-table;vertical-align:middle"><tr>'
            f'<td style="background:#1f5fbf;height:6px;width:{max(v,1)}%;border-radius:3px"></td>'
            f'<td style="background:#e3e7ee;height:6px"></td></tr></table> <span style="font-size:12px;color:#4a5468">{v}%</span>')


def _day_data(rd):
    projects = [decorate(p, rd) for p in q(PROJECT_SELECT + " ORDER BY m.name, p.city, p.code")]
    ups = {}
    for u in q("""SELECT u.*, m.name AS member_name FROM updates u LEFT JOIN members m ON m.id=u.member_id
                  WHERE update_date=? ORDER BY id""", (rd,)):
        ups.setdefault(u["project_id"], []).append(u)
    for p in projects:
        p["updated_today"] = p["id"] in ups
    week = (date.fromisoformat(rd) + timedelta(days=7)).isoformat()
    svc = q("""SELECT s.*, p.code, p.name AS project_name, p.city, p.customer_name, p.customer_phone, p.assigned_to,
               m.name AS technician_name FROM services s JOIN projects p ON p.id=s.project_id
               LEFT JOIN members m ON m.id=s.technician_id
               WHERE s.status='Scheduled' AND s.scheduled_date<=? ORDER BY s.scheduled_date""", (week,))
    return projects, ups, svc


def _work_cell(p, ups):
    u = ups.get(p["id"], [])
    if u:
        txt = "<br>".join(_e(x["work_done"]) for x in u)
        iss = "<br>".join(_e(x["issues"]) for x in u if x["issues"])
        return txt + (f'<div style="color:#b42318;margin-top:3px">Issue: {iss}</div>' if iss else "")
    if p["status"] in ("In Progress", "Rework"):
        return '<span style="color:#b42318;font-weight:600">No update today</span>'
    return '<span style="color:#9aa3b5">-</span>'


def build_report(report_date=None):
    """Manager's evening summary: KPIs, team summary, each member's projects, attention lists."""
    rd = report_date or today()
    s = get_settings()
    projects, ups, svc = _day_data(rd)
    live = [p for p in projects if p["status"] != "Closed"]
    k = dashboard({})["kpi"]
    members = q("SELECT * FROM members WHERE active=1 ORDER BY name")
    missing = [p for p in live if p["status"] in ("In Progress", "Rework") and not p["updated_today"]]

    team_rows = []
    sections = []
    for m in members:
        mp = [p for p in live if p["assigned_to"] == m["id"]]
        if not mp:
            continue
        working = [p for p in mp if p["status"] in ("In Progress", "Rework")]
        upd = sum(p["updated_today"] for p in working)
        od = sum(p["overdue"] for p in mp)
        team_rows.append([f"<b>{_e(m['name'])}</b><div style='color:#7a8396;font-size:12px'>{_e(m['city'])}</div>",
                          len(mp), sum(p["status"] in ACTIVE for p in mp),
                          (f'<span style="color:{"#b42318" if upd < len(working) else "#0f7a55"};font-weight:600">{upd}/{len(working)}</span>'
                           if working else '<span style="color:#9aa3b5">-</span>'),
                          f'<span style="color:{"#b42318" if od else "#14213d"};font-weight:{600 if od else 400}">{od}</span>'])
        rows = [[f"<b>{_e(p['code'])}</b><div>{_e(p['name'])}</div><div style='color:#7a8396;font-size:12px'>{_e(p['city'])} &middot; target {_fmt(p['target_date'])}</div>",
                 _status(p), _bar(p["progress"]), _work_cell(p, ups)] for p in mp]
        sections.append(f'<div style="margin-top:16px;padding:10px 12px;background:#f7f9fc;border-left:3px solid {BRAND};'
                        f'border-radius:6px"><b>{_e(m["name"])}</b> <span style="color:#7a8396">&middot; {_e(m["role"])} &middot; '
                        f'{_e(m["city"])} &middot; {len(mp)} project(s)</span></div>'
                        + _table(["Project", "Status", "Progress", "Today's work"], rows))
    unassigned = [p for p in live if not p["assigned_to"]]
    if unassigned:
        sections.append(_h("Unassigned") + _table(["Project", "Status"], [[_e(p["code"]) + " " + _e(p["name"]), _status(p)] for p in unassigned]))

    insp = q("""SELECT i.*, p.code, p.name AS project_name FROM inspections i JOIN projects p ON p.id=i.project_id
                WHERE inspection_date=?""", (rd,))
    ho = q("""SELECT h.*, p.code, p.name AS project_name FROM handovers h JOIN projects p ON p.id=h.project_id
              WHERE h.handover_date=?""", (rd,))
    fb = q("""SELECT f.*, p.code, p.name AS project_name FROM feedback f JOIN projects p ON p.id=f.project_id
              WHERE feedback_date=?""", (rd,))
    kos = q("""SELECT k.*, p.code, p.name AS project_name FROM kickoffs k JOIN projects p ON p.id=k.project_id
               WHERE k.meeting_date=?""", (rd,))
    scs = q("""SELECT c.*, p.code, p.name AS project_name FROM site_checks c JOIN projects p ON p.id=c.project_id
               WHERE c.check_date=?""", (rd,))
    grs = q("""SELECT g.*, p.code, p.name AS project_name FROM goods_receipts g JOIN projects p ON p.id=g.project_id
               WHERE g.receipt_date=?""", (rd,))
    done_today = [p for p in projects if p.get("completed_date") == rd]
    events = ([f"<b>{_e(k['code'])}</b> {_e(k['project_name'])} - kickoff meeting held ({_e(k['mode'])})" for k in kos]
              + [f"<b>{_e(g['code'])}</b> {_e(g['project_name'])} - finished goods received (challan {_e(g['dc_no'])}): "
                 f"{g['qty_received']} of {g['qty_sent']} qty"
                 + (f', <b style="color:#b42318">{g["qty_short"]} short</b>' if g["qty_short"] else "")
                 + (f', <b style="color:#b42318">{g["qty_damaged"]} damaged</b>' if g["qty_damaged"] else "")
                 + (" - all goods now at site" if g["all_received"] else " - more to come") for g in grs]
              + [f"<b>{_e(c['code'])}</b> {_e(c['project_name'])} - site check: "
                 + ('<b style="color:#0f7a55">Site ready</b>' if c["result"] == "Ready" else
                    f'<b style="color:#b42318">Site not ready</b> - {_e(c["pending_items"])}') for c in scs]
              + [f"<b>{_e(p['code'])}</b> {_e(p['name'])} - installation completed by {_e(p['member_name'])}" for p in done_today]
              + [f"<b>{_e(i['code'])}</b> {_e(i['project_name'])} - inspection <b>{_e(i['result'])}</b> ({_e(i['inspector'])}){' - ' + _e(i['remarks']) if i['remarks'] else ''}" for i in insp]
              + [f"<b>{_e(h['code'])}</b> {_e(h['project_name'])} - handed over to {_e(h['received_by'])}" for h in ho]
              + [f"<b>{_e(f['code'])}</b> {_e(f['project_name'])} - customer rated {f['overall']}/5{' - &ldquo;' + _e(f['comments']) + '&rdquo;' if f['comments'] else ''}" for f in fb])

    body = (
        _kpis([("Active", k["active"], "#14213d"), ("Overdue", k["overdue"], "#b42318" if k["overdue"] else "#14213d"),
               ("No update today", len(missing), "#b42318" if missing else "#14213d"),
               ("Site not ready", k["site_not_ready"], "#b42318" if k["site_not_ready"] else "#14213d"),
               ("Awaiting inspection", k["pending_inspection"], "#14213d"), ("Awaiting handover", k["pending_handover"], "#14213d"),
               ("Free service", k["in_free_service"], "#14213d"), ("CSAT", k["csat"] if k["csat"] is not None else "-", "#0f7a55")])
        + _h("Today's highlights")
        + (("<ul style='margin:0;padding-left:18px'>" + "".join(f"<li style='margin:4px 0'>{e}</li>" for e in events) + "</ul>")
           if events else '<div style="color:#7a8396">No kickoffs, site checks, completions, inspections, handovers or feedback today.</div>')
        + _h("Team summary")
        + _table(["Member", "Projects", "Active", "Updated today", "Overdue"], team_rows, "No projects")
        + _h("Needs attention")
        + _table(["Project", "Member", "Issue"],
                 [[f"{_e(p['code'])} {_e(p['name'])}", _e(p["member_name"]), '<span style="color:#b42318">Overdue - target ' + _fmt(p["target_date"]) + "</span>"] for p in live if p["overdue"]]
                 + [[f"{_e(p['code'])} {_e(p['name'])}", _e(p["member_name"]), "No update today"] for p in missing if not p["overdue"]]
                 + [[f"{_e(p['code'])} {_e(p['name'])}", _e(p["member_name"]), "On hold"] for p in live if p["status"] == "On Hold"]
                 + [[f"{_e(p['code'])} {_e(p['name'])}", _e(p["member_name"]),
                     f'<span style="color:#b42318">Site not ready</span> - {_e(p["site_pending"])}'
                     + (f" (expected {_fmt(p['site_expected'])})" if p.get("site_expected") else "")]
                    for p in live if p["status"] == "Site Not Ready"]
                 + [[f"{_e(p['code'])} {_e(p['name'])}", _e(p["member_name"]),
                     f"Kickoff meeting pending - allotted {p['days_since_allotment']} days ago"] for p in live if p["kickoff_late"]]
                 + [[f"{_e(p['code'])} {_e(p['name'])}", _e(p["member_name"]),
                     "Site ready - waiting for finished goods"] for p in live if p["status"] == "Site Ready"]
                 + [[f"{_e(p['code'])} {_e(p['name'])}", _e(p["member_name"]),
                     f'<span style="color:#a86b00">Goods partly received</span> - {p["goods_short"]} short, {p["goods_damaged"]} damaged so far']
                    for p in live if p["goods_pending"]],
                 "All projects on track.")
        + _h("Free service visits due (next 7 days)")
        + _table(["Date", "Project", "Customer", "Technician"],
                 [[_fmt(x["scheduled_date"]) + (' <span style="color:#b42318">(overdue)</span>' if x["scheduled_date"] < rd else ""),
                   f"{_e(x['code'])} {_e(x['project_name'])}<div style='color:#7a8396;font-size:12px'>visit #{x['visit_no']} &middot; {_e(x['service_type'])}</div>",
                   f"{_e(x['customer_name'])}<div style='color:#7a8396;font-size:12px'>{_e(x['customer_phone'])}</div>", _e(x["technician_name"])] for x in svc],
                 "No visits due.")
        + _h("Projects by team member") + "".join(sections or ['<div style="color:#7a8396">No live projects.</div>'])
    )
    return email_shell("Evening Project Summary", f"{_fmt(rd)} &middot; {len(live)} live project(s) &middot; {len(members)} team member(s)", body, s)


def build_member_summary(member, rd=None):
    rd = rd or today()
    s = get_settings()
    projects, ups, svc = _day_data(rd)
    mp = [p for p in projects if p["assigned_to"] == member["id"] and p["status"] != "Closed"]
    msvc = [x for x in svc if x["technician_id"] == member["id"]]
    if not mp and not msvc:
        return None
    working = [p for p in mp if p["status"] in ACTIVE]
    missing = [p for p in working if p["status"] in ("In Progress", "Rework") and not p["updated_today"]]
    body = (f'<p style="margin:0 0 12px">Hi {_e(member["name"])}, here is the status of your projects for today.</p>'
            + _kpis([("My projects", len(mp), "#14213d"), ("Active", len(working), "#14213d"),
                     ("Pending update", len(missing), "#b42318" if missing else "#0f7a55"),
                     ("Overdue", sum(p["overdue"] for p in mp), "#b42318" if any(p["overdue"] for p in mp) else "#14213d"),
                     ("Service visits due", len(msvc), "#14213d")])
            + (f'<div style="background:#fff4e5;border:1px solid #f5c98b;padding:10px 12px;border-radius:8px;margin:10px 0">'
               f'<b>Please update today:</b> {", ".join(_e(p["code"]) + " " + _e(p["name"]) for p in missing)}</div>' if missing else "")
            + _h("My projects")
            + _table(["Project", "Status", "Progress", "Today's work"],
                     [[f"<b>{_e(p['code'])}</b><div>{_e(p['name'])}</div><div style='color:#7a8396;font-size:12px'>{_e(p['city'])} &middot; target {_fmt(p['target_date'])}</div>",
                       _status(p), _bar(p["progress"]), _work_cell(p, ups)] for p in mp], "No projects.")
            + (_h("My free service visits (next 7 days)") + _table(["Date", "Project", "Customer"],
               [[_fmt(x["scheduled_date"]), f"{_e(x['code'])} {_e(x['project_name'])}", f"{_e(x['customer_name'])} {_e(x['customer_phone'])}"] for x in msvc]) if msvc else ""))
    return email_shell("Your Daily Project Summary", _fmt(rd), body, s)


def send_email(subject, html, recipients, s):
    if not s.get("smtp_host"):
        raise RuntimeError("SMTP not configured (Settings > Email)")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = s.get("smtp_from") or s.get("smtp_user")
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText("Please view this email in an HTML-capable email client.", "plain"))
    msg.attach(MIMEText(html, "html", "utf-8"))
    port = int(s.get("smtp_port") or 587)
    sec = s.get("smtp_security", "starttls")
    ctx = ssl.create_default_context()
    if sec == "ssl":
        srv = smtplib.SMTP_SSL(s["smtp_host"], port, context=ctx, timeout=30)
    else:
        srv = smtplib.SMTP(s["smtp_host"], port, timeout=30)
        if sec == "starttls":
            srv.starttls(context=ctx)
    try:
        if s.get("smtp_user"):
            srv.login(s["smtp_user"], s.get("smtp_password", ""))
        srv.sendmail(msg["From"], recipients, msg.as_string())
    finally:
        srv.quit()


OUTBOX = os.path.join(REPORTS, "outbox")


def deliver(kind, subject, html, recipients):
    """Send an email (or save it to reports/outbox when SMTP is not set up) and log it."""
    s = get_settings()
    seen, rcpt = set(), []
    for r in recipients:
        r = (r or "").strip()
        if EMAIL_RE.match(r) and r.lower() not in seen:
            seen.add(r.lower()); rcpt.append(r)
    fname = ""
    if not rcpt:
        status, message = "No recipient", "No valid email address"
    elif s.get("smtp_host"):
        try:
            send_email(subject, html, rcpt, s)
            status, message = "Sent", "Delivered to mail server"
        except Exception as e:  # noqa
            status, message = "Failed", str(e)
    else:
        os.makedirs(OUTBOX, exist_ok=True)
        slug = re.sub(r"[^a-z0-9]+", "-", f"{kind}-{rcpt[0]}".lower()).strip("-")[:60]
        fname = f"{datetime.now():%Y%m%d-%H%M%S}-{slug}.html"
        header = (f'<div style="font:13px Segoe UI,sans-serif;background:#fffbe6;border-bottom:1px solid #f0d77a;padding:8px 14px">'
                  f'<b>OUTBOX (SMTP not configured - not actually sent)</b><br>To: {escape(", ".join(rcpt))}<br>Subject: {escape(subject)}</div>')
        with open(os.path.join(OUTBOX, fname), "w", encoding="utf-8") as fh:
            fh.write(header + html)
        status, message = "Outbox", "SMTP not configured - saved to outbox"
        fname = "outbox/" + fname
    ex("INSERT INTO email_log(sent_at,kind,recipients,subject,status,message,file) VALUES(?,?,?,?,?,?,?)",
       (datetime.now().isoformat(timespec="seconds"), kind, ", ".join(rcpt), subject, status, message, fname))
    return {"status": status, "message": message, "recipients": rcpt, "file": fname}


def manager_recipients(s=None):
    s = s or get_settings()
    rows = q("SELECT name, email FROM members WHERE active=1 AND daily_summary=1 AND email<>'' ORDER BY name")
    extra = [e.strip() for e in re.split(r"[,;]", s.get("manager_emails", "")) if e.strip()]
    out, seen = [], set()
    for r in rows:
        if EMAIL_RE.match(r["email"]) and r["email"].lower() not in seen:
            seen.add(r["email"].lower()); out.append({"name": r["name"], "email": r["email"]})
    for e in extra:
        if EMAIL_RE.match(e) and e.lower() not in seen:
            seen.add(e.lower()); out.append({"name": "(additional)", "email": e})
    return out


def run_daily_report(trigger="manual", report_date=None):
    rd = report_date or today()
    s = get_settings()
    html = build_report(rd)
    fname = f"daily_report_{rd}.html"
    with open(os.path.join(REPORTS, fname), "w", encoding="utf-8") as f:
        f.write(html)
    mgr = [r["email"] for r in manager_recipients(s)]
    r = deliver("Manager summary", f"Evening Project Summary - {_fmt(rd)}", html, mgr)
    personal = []
    if s.get("member_daily_mail") == "1":
        for m in q("SELECT * FROM members WHERE active=1 AND email<>''"):
            mh = build_member_summary(m, rd)
            if mh:
                personal.append(deliver("Member summary", f"Your projects today - {_fmt(rd)}", mh, [m["email"]]))
    msg = r["message"] if r["status"] != "No recipient" else "No manager email linked (Team Members > tick 'Gets evening summary')."
    if personal:
        ok = sum(p["status"] in ("Sent", "Outbox") for p in personal)
        msg += f" | Personal summaries: {ok}/{len(personal)} members"
    ex("""INSERT INTO report_log(report_date,generated_at,trigger,recipients,status,file,message)
          VALUES(?,?,?,?,?,?,?)""",
       (rd, datetime.now().isoformat(timespec="seconds"), trigger, ", ".join(mgr), r["status"], fname, msg))
    return {"status": r["status"], "message": msg, "file": fname}


def notify_allotment(pid):
    s = get_settings()
    if s.get("notify_allotment") != "1":
        return
    p = q1(PROJECT_SELECT + " WHERE p.id=?", (pid,))
    m = q1("SELECT * FROM members WHERE id=?", (p["assigned_to"],)) if p else None
    if not m or not m.get("email"):
        return
    rows = [["Project", f"<b>{_e(p['code'])}</b> &middot; {_e(p['name'])}"], ["Customer", f"{_e(p['customer_name'])} &middot; {_e(p['customer_phone'])}"],
            ["Site", f"{_e(p['address'])}, {_e(p['city'])}"], ["Start date", _fmt(p["start_date"])],
            ["Target completion", _fmt(p["target_date"])], ["Fitment checking", _e(p.get("fitment_check") or "Not Done")],
            ["Scope / remarks", _e(p["remarks"])]]
    body = (f'<p style="margin:0 0 12px">Hi {_e(m["name"])}, a new installation project has been allotted to you. '
            f'Please post your progress in Daily Updates every day.</p>' + _table([], rows))
    html = email_shell("New project allotted to you", f"{_e(p['code'])} &middot; {_e(p['city'])}", body, s)
    threading.Thread(target=deliver, args=("Allotment", f"New project allotted: {p['code']} - {p['name']}", html, [m["email"]]),
                     daemon=True).start()


def scheduler_loop():
    while True:
        try:
            run_maintenance()
            s = get_settings()
            now = datetime.now()
            hhmm = s.get("report_time") or "19:00"
            if s.get("auto_report_enabled") == "1" and now.strftime("%H:%M") >= hhmm \
                    and s.get("last_auto_report_date") != today():
                set_setting("last_auto_report_date", today())
                r = run_daily_report("automatic")
                print(f"[{now:%H:%M}] Automatic daily report: {r['status']} - {r['message']}")
        except Exception as e:  # noqa
            print("Scheduler error:", e)
        time.sleep(30)


# ------------------------------------------------------------------------ API

class ApiError(Exception):
    def __init__(self, msg, code=400):
        super().__init__(msg)
        self.code = code


def require(body, *fields):
    missing = [f for f in fields if not str(body.get(f) or "").strip()]
    if missing:
        raise ApiError("Required: " + ", ".join(missing))


FITMENT_OPTIONS = ("Done", "Not Done")


def clean_fitment(body):
    v = (body.get("fitment_check") or "Not Done").strip()
    if v not in FITMENT_OPTIONS:
        raise ApiError("Fitment checking must be 'Done' or 'Not Done'")
    return v


def prestart_status(pid, fitment):
    """Pre-start stage implied by the records so far (used when fitment is changed from the edit form)."""
    if fitment == "Done":
        g = (q1("SELECT goods_status FROM projects WHERE id=?", (pid,)) or {}).get("goods_status")
        return {"Complete": "Goods Received", "Partial": "Partly Received"}.get(g, "Site Ready")
    last = q1("SELECT result FROM site_checks WHERE project_id=? ORDER BY id DESC LIMIT 1", (pid,))
    if last and last["result"] == "Not Ready":
        return "Site Not Ready"
    return "Kickoff Done" if q1("SELECT id FROM kickoffs WHERE project_id=?", (pid,)) else "Allotted"


def clean_member(body, mid=None):
    require(body, "name")
    email = (body.get("email") or "").strip()
    if email and not EMAIL_RE.match(email):
        raise ApiError(f"Invalid email address: {email}")
    ds = 1 if body.get("daily_summary") in (True, 1, "1", "on") else 0
    if ds and not email:
        raise ApiError("An email address is needed to receive the evening summary.")
    if email:
        dup = q1("SELECT id, name FROM members WHERE lower(email)=lower(?)", (email,))
        if dup and dup["id"] != mid:
            raise ApiError(f"Email already linked to {dup['name']}")
    return {"name": body["name"].strip(), "role": body.get("role") or "Installer", "city": (body.get("city") or "").strip(),
            "phone": (body.get("phone") or "").strip(), "email": email,
            "active": 1 if body.get("active", True) in (True, 1, "1", "on") else 0, "daily_summary": ds}


ACTIVITY_SQL = """
SELECT * FROM (
  SELECT 'allotted' kind, p.created_at ts, p.id pid, p.code, p.name pname, p.city, m.name who,
         'Allotted to ' || COALESCE(m.name,'-') text FROM projects p LEFT JOIN members m ON m.id=p.assigned_to
  UNION ALL
  SELECT 'update', u.created_at, p.id, p.code, p.name, p.city, m.name,
         u.progress || '% - ' || u.work_done || CASE WHEN COALESCE(u.issues,'')<>'' THEN ' | Issue: ' || u.issues ELSE '' END
         FROM updates u JOIN projects p ON p.id=u.project_id LEFT JOIN members m ON m.id=u.member_id
  UNION ALL
  SELECT 'kickoff', k.created_at, p.id, p.code, p.name, p.city, k.our_attendees, 'Kickoff meeting held (' || COALESCE(k.mode,'-') || ')'
         FROM kickoffs k JOIN projects p ON p.id=k.project_id
  UNION ALL
  SELECT 'sitecheck', c.created_at, p.id, p.code, p.name, p.city, c.checked_by,
         CASE WHEN c.result='Ready' THEN 'Site ready - work can start' ELSE 'Site not ready: ' || COALESCE(c.pending_items,'') END
         FROM site_checks c JOIN projects p ON p.id=c.project_id
  UNION ALL
  SELECT 'goods', g.created_at, p.id, p.code, p.name, p.city, g.received_by,
         'Goods received (challan ' || COALESCE(g.dc_no,'-') || '): ' || g.qty_received || '/' || g.qty_sent
         || CASE WHEN g.qty_short>0 THEN ', ' || g.qty_short || ' short' ELSE '' END
         || CASE WHEN g.qty_damaged>0 THEN ', ' || g.qty_damaged || ' damaged' ELSE '' END
         FROM goods_receipts g JOIN projects p ON p.id=g.project_id
  UNION ALL
  SELECT 'inspection', i.created_at, p.id, p.code, p.name, p.city, i.inspector, 'Final inspection ' || i.result
         FROM inspections i JOIN projects p ON p.id=i.project_id
  UNION ALL
  SELECT 'handover', h.created_at, p.id, p.code, p.name, p.city, h.received_by, 'Handed over to ' || h.received_by
         FROM handovers h JOIN projects p ON p.id=h.project_id
  UNION ALL
  SELECT 'feedback', f.created_at, p.id, p.code, p.name, p.city, p.customer_name, 'Customer rated ' || f.overall || '/5'
         FROM feedback f JOIN projects p ON p.id=f.project_id
) ORDER BY ts DESC LIMIT ?
"""


def api(method, path, qs, body):
    parts = [p for p in path.split("/") if p][1:]  # strip 'api'
    f = {k: v[0] for k, v in qs.items()}

    if parts == ["dashboard"]:
        return dashboard(f)
    if parts == ["version"]:
        return {"version": DATA_VERSION[0], "server_time": datetime.now().isoformat(timespec="seconds")}
    if parts == ["activity"]:
        return q(ACTIVITY_SQL, (int(f.get("limit") or 20),))
    if parts == ["email-log"]:
        return q("SELECT * FROM email_log ORDER BY id DESC LIMIT 200")
    if parts == ["meta"]:
        return {"statuses": STATUSES, "today": today(), "free_service_months": FREE_SERVICE_MONTHS,
                "next_code": next_code(), "company_name": get_settings().get("company_name"),
                "notify_allotment": get_settings().get("notify_allotment") == "1",
                "prestart": PRESTART, "active": ACTIVE, "goods_open": GOODS_OPEN, "kickoff_due_days": KICKOFF_DUE_DAYS,
                "kickoff_modes": KICKOFF_MODES, "kickoff_checklist": KICKOFF_CHECKLIST,
                "site_checklist": [{"group": g, "items": items} for g, items in SITE_CHECKLIST]}

    # ---- members
    if parts == ["members"]:
        if method == "GET":
            return q("""SELECT m.*, (SELECT COUNT(*) FROM projects p WHERE p.assigned_to=m.id) AS project_count,
                        (SELECT COUNT(*) FROM projects p WHERE p.assigned_to=m.id AND p.status IN
                        (""" + ",".join("?" * len(ACTIVE)) + """)) AS active_count
                        FROM members m ORDER BY m.active DESC, m.name""", ACTIVE)
        b = clean_member(body)
        mid = ex("INSERT INTO members(name,role,city,phone,email,active,daily_summary) VALUES(?,?,?,?,?,?,?)",
                 (b["name"], b["role"], b["city"], b["phone"], b["email"], b["active"], b["daily_summary"]))
        return q1("SELECT * FROM members WHERE id=?", (mid,))
    if len(parts) == 2 and parts[0] == "members":
        mid = int(parts[1])
        if method == "PUT":
            b = clean_member(body, mid)
            ex("UPDATE members SET name=?,role=?,city=?,phone=?,email=?,active=?,daily_summary=? WHERE id=?",
               (b["name"], b["role"], b["city"], b["phone"], b["email"], b["active"], b["daily_summary"], mid))
            return q1("SELECT * FROM members WHERE id=?", (mid,))
        if method == "DELETE":
            if q1("SELECT id FROM projects WHERE assigned_to=? LIMIT 1", (mid,)):
                raise ApiError("Member has projects assigned - mark as inactive instead.")
            ex("DELETE FROM members WHERE id=?", (mid,))
            return {"ok": True}

    # ---- projects
    if parts == ["projects"]:
        if method == "GET":
            return list_projects(f)
        require(body, "name", "city", "assigned_to")
        code = (body.get("code") or "").strip() or next_code()
        if q1("SELECT id FROM projects WHERE code=?", (code,)):
            raise ApiError(f"Project code {code} already exists")
        fit = clean_fitment(body)
        pid = ex("""INSERT INTO projects(code,name,customer_name,customer_phone,customer_email,address,city,
                    assigned_to,start_date,target_date,status,progress,fitment_check,remarks) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                 (code, body["name"], body.get("customer_name"), body.get("customer_phone"), body.get("customer_email"),
                  body.get("address"), body["city"].strip(), int(body["assigned_to"]), body.get("start_date") or today(),
                  body.get("target_date"), "Site Ready" if fit == "Done" else "Allotted", 0, fit, body.get("remarks")))
        notify_allotment(pid)
        return get_project(pid)
    if len(parts) >= 2 and parts[0] == "projects":
        pid = int(parts[1])
        p = get_project(pid)
        if not p:
            raise ApiError("Project not found", 404)
        sub = parts[2] if len(parts) > 2 else None
        if sub is None:
            if method == "GET":
                return p
            if method == "PUT":
                require(body, "name", "city", "assigned_to")
                ex("""UPDATE projects SET name=?,customer_name=?,customer_phone=?,customer_email=?,address=?,city=?,
                      assigned_to=?,start_date=?,target_date=?,fitment_check=?,remarks=? WHERE id=?""",
                   (body["name"], body.get("customer_name"), body.get("customer_phone"), body.get("customer_email"),
                    body.get("address"), body["city"].strip(), int(body["assigned_to"]), body.get("start_date"),
                    body.get("target_date"), clean_fitment(body), body.get("remarks"), pid))
                if p["status"] in PRESTART:   # fitment changed from the edit form: keep the pre-start stage in step
                    ex("UPDATE projects SET status=? WHERE id=?", (prestart_status(pid, clean_fitment(body)), pid))
                if int(body["assigned_to"]) != p["assigned_to"]:
                    notify_allotment(pid)
                return get_project(pid)
            if method == "DELETE":
                ex("DELETE FROM projects WHERE id=?", (pid,))
                return {"ok": True}

        if sub == "kickoff" and method == "POST":
            if p["status"] not in PRESTART:
                raise ApiError(f"The kickoff meeting can only be recorded before work starts (current status: {p['status']}).")
            require(body, "meeting_date", "our_attendees", "mom")
            mode = body.get("mode") or KICKOFF_MODES[0]
            if mode not in KICKOFF_MODES:
                raise ApiError("Invalid meeting mode")
            raw = body.get("checklist") or {}
            if isinstance(raw, list):   # points typed in by the user
                raw = {str(i): True for i in raw}
            chk = {}
            for k, v in raw.items():
                k = str(k).strip()[:300]
                if k and v and k not in chk:
                    chk[k] = True
            ex("""INSERT INTO kickoffs(project_id,meeting_date,mode,our_attendees,customer_attendees,checklist,mom,customer_requests)
                  VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET meeting_date=excluded.meeting_date,
                  mode=excluded.mode, our_attendees=excluded.our_attendees, customer_attendees=excluded.customer_attendees,
                  checklist=excluded.checklist, mom=excluded.mom, customer_requests=excluded.customer_requests""",
               (pid, body["meeting_date"], mode, body["our_attendees"].strip(), (body.get("customer_attendees") or "").strip(),
                json.dumps(chk), body["mom"].strip(), (body.get("customer_requests") or "").strip()))
            if body.get("confirmed_start"):
                ex("UPDATE projects SET start_date=? WHERE id=?", (body["confirmed_start"], pid))
            if body.get("confirmed_target"):
                ex("UPDATE projects SET target_date=? WHERE id=?", (body["confirmed_target"], pid))
            if p["status"] == "Allotted":
                ex("UPDATE projects SET status='Kickoff Done' WHERE id=?", (pid,))
            return get_project(pid)

        if sub == "site-check" and method == "POST":
            if p["status"] == "Allotted":
                raise ApiError("Record the kickoff meeting first, then do the site readiness check.")
            if p["status"] not in ("Kickoff Done", "Site Not Ready"):
                raise ApiError(f"Site readiness is checked before work starts (current status: {p['status']}).")
            require(body, "check_date", "checked_by")
            given = body.get("checklist") or {}
            chk = {i: given.get(i) for i in SITE_ITEMS}
            missing = [i for i, v in chk.items() if v not in SITE_ANSWERS]
            if missing:
                raise ApiError(f"Mark every item as Ready, Not Ready or N/A ({len(missing)} left, e.g. '{missing[0]}').")
            not_ready = [i for i, v in chk.items() if v == "Not Ready"]
            result = "Not Ready" if not_ready else "Ready"
            pending = (body.get("pending_items") or "").strip()
            if not_ready and not pending:
                raise ApiError("Some items are Not Ready - describe what is pending and who will do it.")
            ex("""INSERT INTO site_checks(project_id,check_date,checked_by,checklist,result,pending_items,expected_ready_date,remarks)
                  VALUES(?,?,?,?,?,?,?,?)""",
               (pid, body["check_date"], body["checked_by"].strip(), json.dumps(chk), result,
                pending if not_ready else "", body.get("expected_ready_date") if not_ready else None,
                (body.get("remarks") or "").strip()))
            if result == "Ready":
                ex("UPDATE projects SET status='Site Ready', fitment_check='Done' WHERE id=?", (pid,))
            else:
                ex("UPDATE projects SET status='Site Not Ready', fitment_check='Not Done' WHERE id=?", (pid,))
            return get_project(pid)

        if sub == "goods" and method == "POST":
            if p["status"] not in GOODS_OPEN:
                raise ApiError("Finished goods can be recorded once the site is ready, until installation is completed "
                               f"(current status: {p['status']}).")
            require(body, "receipt_date", "dc_no", "received_by")
            items = []
            for n, it in enumerate(body.get("items") or [], 1):
                name = str(it.get("item") or "").strip()
                if not name:
                    continue
                try:
                    sent, recd, dmg = (int(it.get(k) or 0) for k in ("sent", "received", "damaged"))
                except (TypeError, ValueError):
                    raise ApiError(f"Line {n} ({name}): quantities must be whole numbers.")
                if min(sent, recd, dmg) < 0:
                    raise ApiError(f"Line {n} ({name}): quantities cannot be negative.")
                if dmg > recd:
                    raise ApiError(f"Line {n} ({name}): damaged qty ({dmg}) is more than received qty ({recd}).")
                items.append({"item": name, "sent": sent, "received": recd, "damaged": dmg,
                              "short": max(sent - recd, 0), "remarks": str(it.get("remarks") or "").strip()})
            if not items:
                raise ApiError("Add at least one item received.")
            done = 1 if body.get("all_received") in (True, 1, "1", "on") else 0
            ex("""INSERT INTO goods_receipts(project_id,receipt_date,dc_no,vehicle_no,received_by,customer_rep,items,
                  qty_sent,qty_received,qty_short,qty_damaged,all_received,remarks) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
               (pid, body["receipt_date"], body["dc_no"].strip(), (body.get("vehicle_no") or "").strip(),
                body["received_by"].strip(), (body.get("customer_rep") or "").strip(), json.dumps(items),
                sum(i["sent"] for i in items), sum(i["received"] for i in items), sum(i["short"] for i in items),
                sum(i["damaged"] for i in items), done, (body.get("remarks") or "").strip()))
            gs = "Complete" if done or p.get("goods_status") == "Complete" else "Partial"
            ex("UPDATE projects SET goods_status=? WHERE id=?", (gs, pid))
            if p["status"] in ("Site Ready", "Partly Received", "Goods Received"):
                ex("UPDATE projects SET status=? WHERE id=?", ("Goods Received" if gs == "Complete" else "Partly Received", pid))
            return get_project(pid)

        if sub == "updates" and method == "POST":
            if p["status"] not in ACTIVE:
                raise ApiError(f"Daily updates are only for active projects (current status: {p['status']}).")
            blocked = {"Allotted": "The kickoff meeting has not been held yet.",
                       "Kickoff Done": "The site readiness / fitment check is not done yet.",
                       "Site Not Ready": "The site is not ready for installation - re-check the site once the pending work is done.",
                       "Site Ready": "Finished goods have not been received at site yet - record the delivery first."}
            if p["status"] in blocked:
                raise ApiError(blocked[p["status"]] + " Daily updates start once the site is ready and goods are received.")
            require(body, "work_done")
            prog = max(0, min(100, int(body.get("progress") or p["progress"] or 0)))
            st = body.get("status") or "In Progress"
            if st not in ("In Progress", "On Hold"):
                st = "In Progress"
            if p["status"] == "Rework" and st == "In Progress":
                st = "Rework"
            d = body.get("update_date") or today()
            ex("""INSERT INTO updates(project_id,member_id,update_date,progress,status,work_done,issues,next_plan)
                  VALUES(?,?,?,?,?,?,?,?)""",
               (pid, int(body.get("member_id") or p["assigned_to"]), d, prog, st, body["work_done"],
                body.get("issues"), body.get("next_plan")))
            if prog >= 100:
                ex("UPDATE projects SET progress=100,status='Installation Completed',completed_date=? WHERE id=?", (d, pid))
            else:
                ex("UPDATE projects SET progress=?,status=? WHERE id=?", (prog, st, pid))
            return get_project(pid)

        if sub == "inspections" and method == "POST":
            if p["status"] != "Installation Completed":
                raise ApiError("Final inspection is allowed only after installation is completed (progress 100%).")
            require(body, "inspector", "result")
            if body["result"] not in ("Passed", "Failed"):
                raise ApiError("Result must be Passed or Failed")
            ex("""INSERT INTO inspections(project_id,inspector,inspection_date,checklist,result,remarks)
                  VALUES(?,?,?,?,?,?)""",
               (pid, body["inspector"], body.get("inspection_date") or today(),
                json.dumps(body.get("checklist") or {}), body["result"], body.get("remarks")))
            if body["result"] == "Passed":
                ex("UPDATE projects SET status='Inspection Passed' WHERE id=?", (pid,))
            else:
                ex("UPDATE projects SET status='Rework', progress=90 WHERE id=?", (pid,))
            return get_project(pid)

        if sub == "handover" and method == "POST":
            if p["status"] != "Inspection Passed":
                raise ApiError("Handover is allowed only after the final inspection has passed.")
            require(body, "received_by")
            hd = body.get("handover_date") or today()
            end = add_months(hd, FREE_SERVICE_MONTHS)
            ex("""INSERT INTO handovers(project_id,handover_date,received_by,receiver_phone,documents,remarks)
                  VALUES(?,?,?,?,?,?)""",
               (pid, hd, body["received_by"], body.get("receiver_phone"), body.get("documents"), body.get("remarks")))
            ex("UPDATE projects SET status='Handed Over', handover_date=?, service_end_date=? WHERE id=?", (hd, end, pid))
            for i in range(1, FREE_SERVICE_MONTHS + 1):
                ex("""INSERT INTO services(project_id,visit_no,service_type,scheduled_date,status,technician_id)
                      VALUES(?,?,?,?,?,?)""", (pid, i, "Scheduled", add_months(hd, i), "Scheduled", p["assigned_to"]))
            return get_project(pid)

        if sub == "feedback" and method == "POST":
            if p["status"] not in ("Handed Over", "Closed"):
                raise ApiError("Customer feedback is taken after handover.")
            vals = {}
            for k in ("quality", "timeliness", "team_behaviour", "cleanliness", "overall"):
                v = int(body.get(k) or 0)
                if not 1 <= v <= 5:
                    raise ApiError(f"Rating '{k}' must be 1-5")
                vals[k] = v
            ex("""INSERT INTO feedback(project_id,feedback_date,quality,timeliness,team_behaviour,cleanliness,overall,
                  recommend,comments) VALUES(?,?,?,?,?,?,?,?,?)""",
               (pid, body.get("feedback_date") or today(), vals["quality"], vals["timeliness"],
                vals["team_behaviour"], vals["cleanliness"], vals["overall"], body.get("recommend") or "Yes",
                body.get("comments")))
            return get_project(pid)

        if sub == "services" and method == "POST":
            if p["status"] != "Handed Over":
                raise ApiError("Free service visits can be added only during the 3-month free service period.")
            d = body.get("scheduled_date") or today()
            if d > p["service_end_date"]:
                raise ApiError(f"Free service period ends on {p['service_end_date']}.")
            n = (q1("SELECT MAX(visit_no) n FROM services WHERE project_id=?", (pid,))["n"] or 0) + 1
            ex("""INSERT INTO services(project_id,visit_no,service_type,scheduled_date,status,technician_id,issue)
                  VALUES(?,?,?,?,?,?,?)""",
               (pid, n, body.get("service_type") or "Complaint", d, "Scheduled",
                int(body.get("technician_id") or p["assigned_to"]), body.get("issue")))
            return get_project(pid)

    # ---- services
    if parts == ["services"]:
        rows = q("""SELECT s.*, p.code, p.name AS project_name, p.city, p.customer_name, p.customer_phone,
                    p.service_end_date, m.name AS technician_name FROM services s JOIN projects p ON p.id=s.project_id
                    LEFT JOIN members m ON m.id=s.technician_id ORDER BY s.scheduled_date""")
        if f.get("status"):
            rows = [r for r in rows if r["status"] == f["status"]]
        return rows
    if len(parts) == 2 and parts[0] == "services" and method == "PUT":
        sid = int(parts[1])
        ex("""UPDATE services SET status=?, scheduled_date=?, technician_id=?, completed_date=?, issue=?, action_taken=?
              WHERE id=?""",
           (body.get("status"), body.get("scheduled_date"), body.get("technician_id") or None,
            body.get("completed_date") or (today() if body.get("status") == "Completed" else None),
            body.get("issue"), body.get("action_taken"), sid))
        return q1("SELECT * FROM services WHERE id=?", (sid,))

    # ---- feedback list
    if parts == ["feedback"]:
        rows = q("""SELECT f.*, p.code, p.name AS project_name, p.city, p.customer_name, m.name AS member_name
                    FROM feedback f JOIN projects p ON p.id=f.project_id LEFT JOIN members m ON m.id=p.assigned_to
                    ORDER BY f.feedback_date DESC""")
        keys = ("quality", "timeliness", "team_behaviour", "cleanliness", "overall")
        avg = {k: round(sum(r[k] for r in rows) / len(rows), 2) for k in keys} if rows else {}
        pending = q("""SELECT p.id, p.code, p.name, p.city, p.customer_name, p.customer_phone, p.handover_date
                       FROM projects p WHERE p.status IN ('Handed Over','Closed')
                       AND NOT EXISTS (SELECT 1 FROM feedback f WHERE f.project_id=p.id) ORDER BY p.handover_date""")
        rec = sum(r["recommend"] == "Yes" for r in rows)
        return {"rows": rows, "avg": avg, "pending": pending,
                "recommend_pct": round(100 * rec / len(rows)) if rows else None}

    # ---- reports
    if parts == ["reports"]:
        return q("SELECT * FROM report_log ORDER BY id DESC LIMIT 100")
    if parts == ["reports", "run"] and method == "POST":
        return run_daily_report("manual", body.get("date") or None)
    if parts == ["reports", "preview"]:
        return {"html": build_report(f.get("date") or None)}

    # ---- settings
    if parts == ["settings"]:
        if method == "GET":
            s = get_settings()
            s["smtp_password"] = "********" if s.get("smtp_password") else ""
            s["summary_recipients"] = manager_recipients(s)
            s["member_mail_count"] = q1("SELECT COUNT(*) n FROM members WHERE active=1 AND email<>''")["n"]
            return s
        for k in DEFAULT_SETTINGS:
            if k in body and k != "last_auto_report_date":
                if k == "smtp_password" and body[k] == "********":
                    continue
                set_setting(k, body[k])
        return {"ok": True}
    if parts == ["settings", "test-email"] and method == "POST":
        s = get_settings()
        to = [e.strip() for e in re.split(r"[,;]", body.get("to") or "") if e.strip()] \
            or [r["email"] for r in manager_recipients(s)]
        if not to:
            raise ApiError("No recipient - link a manager email in Team Members first")
        if not s.get("smtp_host"):
            raise ApiError("Enter the SMTP host first")
        html = email_shell("Test email", "SMTP settings check", "<p>Your email settings are working. "
                           "The evening project summary will be delivered to this address.</p>", s)
        r = deliver("Test", "Installation Tracker - test email", html, to)
        if r["status"] != "Sent":
            raise ApiError(f"Email failed: {r['message']}")
        return {"ok": True, "message": f"Test email sent to {', '.join(r['recipients'])}"}

    raise ApiError("Not found", 404)


MIME = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send(self, code, data, ctype="application/json; charset=utf-8"):
        payload = data if isinstance(data, bytes) else json.dumps(data, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def handle_any(self, method):
        url = urlparse(self.path)
        if url.path.startswith("/api/"):
            body = {}
            if method in ("POST", "PUT"):
                n = int(self.headers.get("Content-Length") or 0)
                if n:
                    try:
                        body = json.loads(self.rfile.read(n).decode("utf-8"))
                    except Exception:
                        return self.send(400, {"error": "Invalid JSON"})
            try:
                return self.send(200, api(method, url.path, parse_qs(url.query), body))
            except ApiError as e:
                return self.send(e.code, {"error": str(e)})
            except sqlite3.IntegrityError as e:
                return self.send(400, {"error": f"Data error: {e}"})
            except Exception as e:  # noqa
                import traceback; traceback.print_exc()
                return self.send(500, {"error": f"Server error: {e}"})
        if method != "GET":
            return self.send(405, {"error": "Method not allowed"})
        if url.path.startswith("/reports/"):
            from urllib.parse import unquote
            fp = os.path.normpath(os.path.join(REPORTS, unquote(url.path[len("/reports/"):])))
            if fp.startswith(REPORTS + os.sep) and fp.endswith(".html") and os.path.isfile(fp):
                with open(fp, "rb") as fh:
                    return self.send(200, fh.read(), MIME[".html"])
            return self.send(404, b"Not found", "text/plain")
        rel = url.path.lstrip("/") or "index.html"
        fp = os.path.normpath(os.path.join(STATIC, rel))
        if not fp.startswith(STATIC + os.sep) or not os.path.isfile(fp):
            fp = os.path.join(STATIC, "index.html")
        with open(fp, "rb") as fh:
            self.send(200, fh.read(), MIME.get(os.path.splitext(fp)[1], "application/octet-stream"))

    def do_GET(self): self.handle_any("GET")
    def do_POST(self): self.handle_any("POST")
    def do_PUT(self): self.handle_any("PUT")
    def do_DELETE(self): self.handle_any("DELETE")


def main():
    init_db()
    port = 8080
    if "--port" in sys.argv:
        port = int(sys.argv[sys.argv.index("--port") + 1])
    if "--demo" in sys.argv:
        import seed_demo
        seed_demo.seed()
    run_maintenance()
    threading.Thread(target=scheduler_loop, daemon=True).start()
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Installation Tracker running at http://localhost:{port}  (Ctrl+C to stop)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("Stopped.")


if __name__ == "__main__":
    main()
