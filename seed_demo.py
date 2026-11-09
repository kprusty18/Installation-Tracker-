"""Loads sample data through the same API the UI uses (only if the database has no projects)."""
from datetime import date, timedelta


def d(days):
    return (date.today() + timedelta(days=days)).isoformat()


def seed():
    import server as S
    api = S.api
    if S.q1("SELECT id FROM projects LIMIT 1"):
        print("Demo data skipped - database already has projects.")
        return

    members = [
        ("Ravi Kumar", "Installer", "Bengaluru", "9800000001", "ravi@example.com"),
        ("Arun Prakash", "Installer", "Chennai", "9800000002", "arun@example.com"),
        ("Imran Shaikh", "Installer", "Mumbai", "9800000003", "imran@example.com"),
        ("Suresh Reddy", "Installer", "Hyderabad", "9800000004", "suresh@example.com"),
        ("Meena Iyer", "Supervisor", "Bengaluru", "9800000005", "meena@example.com"),
    ]
    ids = []
    for n, r, c, ph, em in members:
        ids.append(api("POST", "/api/members", {}, {"name": n, "role": r, "city": c, "phone": ph, "email": em})["id"])
    api("POST", "/api/members", {}, {"name": "Operations Manager", "role": "Manager", "city": "Bengaluru",
                                     "phone": "9800000000", "email": "manager@example.com", "daily_summary": True})
    S.set_setting("notify_allotment", "0")   # don't fill the outbox with demo allotment mails
    ravi, arun, imran, suresh, meena = ids

    dc = [1040]

    def goods(pid, day, items, final=True, who="Installer"):
        dc[0] += 1
        api("POST", f"/api/projects/{pid}/goods", {}, {
            "receipt_date": d(day), "dc_no": f"DC-{dc[0]}", "vehicle_no": "KA01AB" + str(1000 + dc[0]), "received_by": who,
            "items": [{"item": n, "sent": s, "received": r, "damaged": dm, "remarks": rm} for n, s, r, dm, rm in items],
            "all_received": final})

    std_items = [("Carcass / cabinet boxes", 12, 12, 0, ""), ("Shutters & panels", 24, 24, 0, ""), ("Hardware box", 2, 2, 0, "")]

    def proj(name, cust, city, who, start, target, fitment="Done", deliver=True):
        pid = api("POST", "/api/projects", {}, {
            "name": name, "customer_name": cust, "customer_phone": "98450" + str(abs(hash(name)) % 100000).zfill(5),
            "address": f"{city}", "city": city, "assigned_to": who, "start_date": d(start), "target_date": d(target),
            "fitment_check": fitment})["id"]
        if fitment == "Done" and deliver:
            goods(pid, start, std_items)
        return pid

    def upd(pid, day, prog, work, issues="", status="In Progress"):
        api("POST", f"/api/projects/{pid}/updates", {}, {"update_date": d(day), "progress": prog, "work_done": work,
                                                          "issues": issues, "status": status})

    checklist = {"Alignment & levelling": True, "Hardware & fittings": True, "Finish / no damage": True,
                 "Site cleaned": True, "Customer walkthrough": True}

    # Bengaluru
    p = proj("Villa 12 - Modular Kitchen & Wardrobes", "Mr. Anand Rao", "Bengaluru", ravi, -10, 5, deliver=False)
    goods(p, -10, [("Kitchen base units", 6, 6, 0, ""), ("Kitchen wall units", 5, 5, 0, ""),
                   ("Shutters", 18, 16, 2, "2 short; 2 with corner damage in transit"), ("Wardrobe carcass", 4, 4, 0, ""),
                   ("Hardware box", 2, 2, 0, "")], final=False, who="Ravi Kumar")
    upd(p, -9, 15, "Material unloaded, carcass assembly started")
    upd(p, -5, 40, "Kitchen base units fixed")
    upd(p, 0, 60, "Wall units fixed, shutters 50% done", "2 shutters damaged in transit - replacement requested")

    p = proj("Apartment 4B - Full Interiors", "Ms. Kavya N", "Bengaluru", ravi, -30, -3)
    upd(p, -25, 30, "Wardrobes installed in 2 bedrooms")
    upd(p, -2, 85, "TV unit and crockery unit fixed", "Countertop delayed by vendor")

    p = proj("Office 3rd Floor - Workstations", "Zenith Tech Pvt Ltd", "Bengaluru", meena, -40, -15)
    upd(p, -30, 50, "Workstations assembled")
    upd(p, -20, 100, "All units fixed, cabling trays done")
    api("POST", f"/api/projects/{p}/inspections", {}, {"inspector": "Meena Iyer", "result": "Passed",
                                                         "inspection_date": d(-18), "checklist": checklist,
                                                         "remarks": "All good"})
    api("POST", f"/api/projects/{p}/handover", {}, {"received_by": "Facility Manager - Vinod", "handover_date": d(-17),
                                                      "documents": "Warranty card, Care manual, Keys"})
    api("POST", f"/api/projects/{p}/feedback", {}, {"quality": 5, "timeliness": 4, "team_behaviour": 5,
                                                      "cleanliness": 4, "overall": 5, "recommend": "Yes",
                                                      "comments": "Neat work, team was professional", "feedback_date": d(-15)})

    # Chennai
    p = proj("Duplex House - Wardrobes", "Mr. Senthil", "Chennai", arun, -20, -1)
    upd(p, -18, 40, "Ground floor wardrobes done")
    upd(p, -3, 100, "First floor wardrobes done, handles fixed")

    p = proj("Flat 7C - Kitchen", "Mrs. Lakshmi", "Chennai", arun, -2, 12, fitment="Not Done")
    api("POST", f"/api/projects/{p}/kickoff", {}, {
        "meeting_date": d(-2), "mode": "At site", "our_attendees": "Arun Prakash", "customer_attendees": "Mrs. Lakshmi",
        "checklist": {i: True for i in S.KICKOFF_CHECKLIST},
        "mom": "Scope: L-shaped kitchen with tall unit. Customer to finish painting and shift the sink drain point before installation.",
        "customer_requests": "Soft-close hinges on all shutters"})
    site = {i: "Ready" for i in S.SITE_ITEMS}
    site.update({"Walls plastered, putty & primer done": "Not Ready", "Water inlet & drain points as per drawing": "Not Ready",
                 "Gas pipeline point ready": "N/A"})
    api("POST", f"/api/projects/{p}/site-check", {}, {
        "check_date": d(0), "checked_by": "Arun Prakash", "checklist": site,
        "pending_items": "Painting not finished (customer's painter); sink drain point to shift 200 mm (customer's plumber)",
        "expected_ready_date": d(4)})

    proj("Row House - Wardrobes & TV Unit", "Mr. Karthik", "Bengaluru", ravi, 3, 20, fitment="Not Done")
    proj("Clinic - Reception Desk & Storage", "Dr. Fernandes", "Mumbai", imran, 2, 14, deliver=False)   # site ready, awaiting goods
    p = proj("Studio Apt - Wardrobe", "Ms. Neha", "Hyderabad", suresh, 1, 10, fitment="Not Done")
    api("POST", f"/api/projects/{p}/kickoff", {}, {
        "meeting_date": d(0), "mode": "Phone / video call", "our_attendees": "Suresh Reddy", "customer_attendees": "Ms. Neha",
        "checklist": {i: True for i in S.KICKOFF_CHECKLIST[:5]}, "mom": "Single sliding wardrobe; site visit for readiness check tomorrow."})

    p = proj("Bungalow - Full Interiors", "Dr. Ramesh", "Chennai", arun, -70, -45)
    upd(p, -60, 100, "Completed all rooms")
    api("POST", f"/api/projects/{p}/inspections", {}, {"inspector": "Meena Iyer", "result": "Passed",
                                                         "inspection_date": d(-58), "checklist": checklist})
    api("POST", f"/api/projects/{p}/handover", {}, {"received_by": "Dr. Ramesh", "handover_date": d(-57)})
    api("POST", f"/api/projects/{p}/feedback", {}, {"quality": 4, "timeliness": 3, "team_behaviour": 5,
                                                      "cleanliness": 4, "overall": 4, "recommend": "Yes",
                                                      "comments": "Slight delay but good finish", "feedback_date": d(-55)})

    # Mumbai
    p = proj("Sea View Apt - Living & Bedroom", "Mr. Desai", "Mumbai", imran, -15, 10)
    upd(p, -14, 20, "Site measurement re-checked, started bedroom")
    upd(p, -1, 45, "Bedroom wardrobe done", "Customer away - site locked for 3 days", "On Hold")

    p = proj("Showroom Fit-out", "Urban Living Retail", "Mumbai", imran, -25, -5)
    upd(p, -20, 70, "Display units fixed")
    upd(p, -8, 100, "Lighting panels fixed")
    api("POST", f"/api/projects/{p}/inspections", {}, {"inspector": "Meena Iyer", "result": "Failed",
                                                         "inspection_date": d(-6),
                                                         "checklist": {**checklist, "Finish / no damage": False},
                                                         "remarks": "Scratches on 2 panels, gap in shelf"})
    upd(p, 0, 95, "Panels re-polished, shelf gap fixed")

    # Hyderabad
    p = proj("Gated Villa - Kitchen & Utility", "Mr. Venkat", "Hyderabad", suresh, -18, 2)
    upd(p, -16, 50, "Kitchen done")
    upd(p, -4, 100, "Utility area done")
    api("POST", f"/api/projects/{p}/inspections", {}, {"inspector": "Meena Iyer", "result": "Passed",
                                                         "inspection_date": d(-1), "checklist": checklist})

    p = proj("Penthouse - Wardrobes", "Ms. Priya", "Hyderabad", suresh, -5, 15)
    upd(p, -1, 10, "Material received at site")

    S.set_setting("notify_allotment", "1")
    print("Demo data loaded.")
