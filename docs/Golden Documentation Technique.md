**Summary of Brad’s Documentation Technique**

Brad’s approach to agent-based AI/software development is “documentation-first” with an emphasis on clarity, precision, and iterative improvement. Here’s a concise summary of his technique:

**1. Three “Gold Standard” Documents**
Brad organizes every project around three core documents—these serve as building blocks for everything else:

- **Philosophy/Soul Document (“Why”)**  
  Captures the core purpose, principles, or “soul” of the project or agent. This establishes direction, abstracts the mission, and helps agents and humans align. Including this reduces “drift” when using AI agents.

- **Specifications Document (“What”)**  
  Includes technical details, features, requirements, and blueprints—the “what needs to be built.” Brad prefers to keep this as concise as possible, not splitting into a multitude of small documents.

- **Implementation Plan (“How”)**  
  Outlines high-level steps, phases, and monitoring needed to achieve the above, including how to test and update.

Other documents (e.g., APIs, data architectures) are created only as needed.

**2. Human-in-the-Loop and Iterative Refinement**
- Brad usually handcrafts the initial version of each document and agent, then iteratively prompts AI (like Claude) to improve them.
- He relies heavily on “human in the loop” review to ensure quality, clarity, and non-fabrication (since LLMs can hallucinate or gloss over mistakes).

**3. Grounding and Rubrics**
- He “grounds” the documentation and agents with clear context, personas, and guidance.
- Uses explicit rubrics (scoring/evaluation criteria) to help both AIs and humans assess and improve documents and agent outputs at each iteration.

**4. Template, Recursion, and Agent Creation**
- After creating an initial gold-standard agent or doc, Brad builds templates for future use.
- He lets agents recursively improve and generate new agents using these templates—a flywheel effect, where each generation improves the next one.

**5. Fewer, More Detailed Agents**
- Unlike some agentic approaches that generate many small, specialized agents, Brad prefers a small number of detailed, clearly-bounded agents, each with a well-defined scope and explicit instructions.

**6. Iterative Documentation Improvement Workflow**
- Gold-standard docs and agents are not assumed perfect after the first draft.  
- Brad runs agents to critique and rewrite docs, often rating their quality via rubrics, then improves and reruns until he’s satisfied or until the documentation is truly production-grade.

**7. Documentation Drives Everything**
- In Brad’s philosophy, good documentation is the “money-maker”: if the docs are right, the code (and agent outputs) will follow smoothly; if not, downstream errors, rework, and chaos are inevitable.

**8. Hybrid Symbolic/Neuro-symbolic Approaches**
- Brad is developing symbolic/neuro-symbolic documentation formats to make docs both AI- and human-friendly, improving clarity while reducing ambiguity for LLMs.

**In summary:**  
Brad’s documentation technique focuses on a disciplined, iterative, and template-driven process with three core “gold standard” documents (why/what/how), continuous human and agent review, rubric-based evaluation, and a preference for a small number of clear, comprehensive artifacts. Documentation is seen as the backbone of successful agentic engineering.