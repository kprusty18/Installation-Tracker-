<<<<<<< HEAD
# Installation Tracker (local)

You only need Python 3. There is nothing to install and nothing is published. The app runs on your PC only, at http://localhost:8080.

## Run
- Double-click **start.bat**, or run `python server.py`.
- To try it with sample data, run `python server.py --demo`. This loads 5 members and 13 projects in every stage, and only if the database is empty.
- To start fresh, stop the server and delete the `data` folder.

## Workflow
1. **Team Members**: add installers, supervisors and inspectors, each with a city.
2. **Projects & Allotment**: create a project and allot it to a member. Its status becomes *Allotted*. If the fitment check was already done, choose "Fitment checking done" and the project goes straight to *Site Ready*.
3. **Kickoff & Site Readiness**:
   - **Kickoff meeting**: record the date, who attended, the points covered, the minutes (MoM) and the customer's requests. The status becomes *Kickoff Done*. Projects still waiting for a kickoff are flagged late after 3 days.
   - **Site readiness & fitment check**: mark each checklist point (civil, electrical, plumbing, measurements, access, coordination, safety) as Ready, Not Ready or N/A. If every point is Ready or N/A, the status becomes *Site Ready*. If any point is Not Ready, the status becomes *Site Not Ready*, with what is pending and the expected ready date. Re-check the site once it's fixed.
   - **Finished goods received at site**: once the site is ready, record each delivery against its delivery challan (DC no., vehicle, who received it), item by item: qty sent, qty received and qty damaged. Shortages and damages are totalled automatically. After the first delivery the status becomes *Partly Received* and work can start. Tick "All goods received" on the delivery that completes the order, and the status becomes *Goods Received*. Deliveries can still be added while installation is in progress, and projects with a balance still to come are flagged *Goods partly received*.
   - Daily updates are blocked until the site is ready and the first goods delivery is recorded.
4. **Daily Updates**: each member records the day's progress %, work done and issues. When progress reaches 100%, the status becomes *Installation Completed*.
5. **Final Inspection**: work through the checklist, then record Passed or Failed. Passed moves the project to *Inspection Passed*. Failed sends it to *Rework* with the installer.
6. **Handover**: record the handover to the customer. The status becomes *Handed Over*. The free service period is set to 3 months from the handover date, and 3 monthly visits are scheduled automatically.
7. **Free Service**: track the scheduled visits and complaint visits, and mark them Completed. When the 3 months end, the project closes automatically (*Closed*).
8. **Customer Satisfaction**: record a 1-5 rating on 5 parameters. The CSAT report shows the averages and has a per-member breakdown.
9. **Dashboard**: shows the KPIs (including kickoff pending and site not ready), each person's projects and status, the city-wise status, overdue projects, projects with no update today, and the service visits due. You can filter by member or city.

## Live dashboard
Every open page checks with the server every 4 seconds. When anyone saves something (an update, an allotment, an inspection and so on), all open pages refresh by themselves. The green **Live** badge at the top shows the last sync time. If the server stops, the badge turns red and says "Offline". A page doesn't refresh while you're typing in a form; it catches up when you close the form.

## Emails for everyone
In **Team Members**, add an email ID for each person.
- **Managers:** tick "Gets the evening summary of all projects" (this is ticked automatically for the Manager role). Every evening they get the full summary. It covers highlights, a team summary, the projects that need attention, the service visits due, and each member's projects with today's work.
- **Every member with an email** gets:
  - an email when a project is allotted to them
  - an evening summary of their own projects, including a "please update" list

  You can turn both off in Settings.
- **Before SMTP is set up:** the emails are saved to `reports\outbox\` instead of being sent. Open them from **Email & Reports > All emails** to see exactly what each person will receive.

## Daily report to manager
Go to **Settings** and enter the manager's email(s), the report time (default 19:00) and the SMTP details. Then use **Send test email** to check them.
- For Microsoft 365, use host `smtp.office365.com`, port 587, `starttls`. The account must allow SMTP AUTH.
- For Gmail, use host `smtp.gmail.com`, port 587, `starttls`, with an App Password.

Every day at the set time the report is built and saved to `reports\daily_report_YYYY-MM-DD.html`, then emailed. It covers project-wise status, today's work and issues, the projects with no update, inspections, handovers, services due and feedback. **The server must be running at that time.** If the server was off and starts after the report time, it sends that day's report immediately. You can also use **Daily Reports > Generate & send now**.

## Files
- `server.py`: the backend (API, SQLite database, scheduler, email)
- `static/`: the web pages
- `data/tracker.db`: your data. Back up this file.
- `reports/`: the saved daily reports

## Notes for later (before using with the team)
- There is no login yet. Anyone who opens the page can edit everything. Add user logins and roles (manager or installer) before sharing it on the network.
- The SMTP password is stored as plain text in the local database.
- The server listens only on this PC (127.0.0.1). For team members' phones, run it on a shared server or host it later.
=======
# Installation-Tracker-
>>>>>>> b265c85211dae9394029cc4e1dc7b79301e473a6
