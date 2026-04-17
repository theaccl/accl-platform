const fs=require("fs");const p="app/trainer/review/page.tsx";let t=fs.readFileSync(p,"utf8");t=t.replace(`: "/finished"}`,`: "/trainer/review"}`);fs.writeFileSync(p,t);console.log("ok");
