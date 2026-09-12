import { join } from "node:path";
import { imageFeatures } from "./images.js";
export async function seed(db, root) {
  if (
    db.prepare("SELECT id FROM samples LIMIT 1").get() ||
    process.env.NO_SEED === "1"
  )
    return;
  const names = [
    "藤编悬挂休闲椅",
    "树形记忆相框",
    "桌面绿植摆件",
    "几何陶瓷花器",
    "暖光织物台灯",
    "原木软包双人床",
    "弧线皮质沙发",
    "樱桃木床头柜",
    "软包会议单椅",
    "木质浴室柜",
  ];
  const colors = [
    "原木",
    "墨黑",
    "苔绿",
    "赤陶",
    "云白",
    "原木",
    "原木",
    "雾灰",
    "原木",
    "云白",
  ];
  for (let i = 0; i < 10; i++) {
    const at = new Date(Date.now() - (i + 1) * 86400000).toISOString();
    const image = `/demo/${i + 1}.webp`;
    const f = await imageFeatures(join(root, "public", image));
    db.prepare(
      "INSERT INTO samples VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      `demo-${i + 1}`,
      `20260901-${i < 5 ? "DEC" : "FUR"}-${String(i + 1).padStart(6, "0")}`,
      names[i],
      i < 5 ? "家居饰品" : "家具",
      colors[i],
      20 + i * 8,
      15 + i * 5,
      25 + i * 4,
      image,
      JSON.stringify(f.descriptor),
      "演示样品，用于体验团队评审流程。尺寸为示例数据。",
      (i % 3) + 1,
      at,
      at,
      i === 3 || i === 8 ? 0 : 1,
      new Date(Date.now() + 14 * 86400000).toISOString(),
      0,
      1,
    );
    if (i !== 3 && i !== 8)
      for (let u = 1; u <= 3; u++) {
        const t = new Date(Date.now() - ((i + u) % 6) * 86400000).toISOString();
        if ((i + u) % 3 !== 0)
          db.prepare("INSERT INTO reactions VALUES (?,?,?,?)").run(
            `demo-${i + 1}`,
            u,
            "like",
            t,
          );
        if ((i + u) % 2 === 0)
          db.prepare("INSERT INTO reactions VALUES (?,?,?,?)").run(
            `demo-${i + 1}`,
            u,
            "favorite",
            t,
          );
        if (u === 2)
          db.prepare("INSERT INTO comments VALUES (?,?,?,?,?,?)").run(
            `comment-${i}`,
            `demo-${i + 1}`,
            u,
            "造型简洁，建议补充材质与量产成本，便于进一步评估。",
            null,
            t,
          );
      }
  }
  db.prepare(
    "INSERT INTO audit(user_id,action,detail,created_at) VALUES (1,?,?,?)",
  ).run("初始化", "已载入 10 个演示样品", new Date().toISOString());
}
