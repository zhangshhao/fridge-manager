# 本地菜谱数据

数据来自 [Anduin2017/HowToCook](https://github.com/Anduin2017/HowToCook)，固定版本 `308cc8b7dab1da84b20e7fafdf836a715437f582`，采用 Unlicense，许可原文见 `HowToCook-LICENSE.txt`。

当前导入 331 道食谱，范围为素菜、荤菜、水产、汤羹、主食、早餐、甜品。未导入示例模板、饮料、半成品和单独的调味酱制作。保存原用料、计算说明、操作步骤、小贴士和原文路径；只提取文本，不打包第三方图片。用量和小贴士保留段落、小标题与完整表格，做法按原文阶段分组；Markdown 标记转为普通文字，乘法与正负号使用 ×、± 显示。为兼容记餐快照，同时保留最多 20 步的合并文本。菜谱仍保留原始份数及公式，没有自动猜测“适量”、包装重量或实际用量。

`scripts/recipe-text.ts` 对固定来源中的程序式写法做明确翻译：太阳蛋的加热循环、肥牛丼的调味循环改为中文操作，保留每次用量、时间及停止条件；酿菜的编程比喻改为食材搭配说明，排骨菜谱改用厨房术语。重复展示已有步骤的 Mermaid 流程图省略，普通文本代码块中的食材比例仍保留；遇到未处理的程序代码块会中止导入，避免源码进入页面。原文链接保留，可查看原始说明与配图。

数据是随代码打包的 JSON，推荐服务运行时不访问 GitHub、不调用模型、不写入库存或 AI 计费记录。来源可能有遗漏或不适合具体食材的建议，做菜前应核对原文、原包装、熟度和忌口；关键词匹配不能保证识别全部过敏原。

重建方法（联网只用于一次性取得源文件）：

```powershell
git clone --filter=blob:none --no-checkout https://github.com/Anduin2017/HowToCook.git .local/howtocook
git -C .local/howtocook checkout 308cc8b7dab1da84b20e7fafdf836a715437f582
npm run recipes:import -- .local/howtocook
```

导入脚本校验版本和许可，排序输出稳定 ID。更新来源版本时，应同时审核许可、解析结果和库存匹配测试。
