# Exploratory Testing Heuristic Cheat Sheet

## SFDIPOT (What to Test)
| Factor | Questions to Ask |
|--------|-----------------|
| **Structure** | What is it made of? What are the components? |
| **Function** | What does it do? What are all the features? |
| **Data** | What data does it process? Boundary values? |
| **Interfaces** | How does it connect to other things? APIs? UI? |
| **Platform** | What does it depend on? OS? Browser? Network? |
| **Operations** | How will it be used? By whom? How often? |
| **Time** | What changes over time? Timeouts? Scheduling? |

## FEW HICCUPPS (How to Recognize Problems)
| Oracle | What to Compare Against |
|--------|----------------------|
| **Familiar** | Does it work like similar products I know? |
| **Explainable** | Can I explain what it does to someone? |
| **World** | Does it match how the real world works? |
| **History** | Is it consistent with previous versions? |
| **Image** | Does it match the organization's brand/values? |
| **Comparable** | How does it compare to competitors? |
| **Claims** | Does it match specs, docs, marketing? |
| **Users** | Does it serve the actual users' needs? |
| **Product** | Is it internally consistent? |
| **Purpose** | Does it fulfill its reason for existing? |
| **Standards** | Does it meet relevant standards (WCAG, RFC)? |

## Test Tours (How to Explore)
| Tour | Strategy |
|------|----------|
| **Guidebook** | Follow the documentation exactly |
| **Money** | Test the revenue-critical features |
| **Landmark** | Navigate between major features |
| **Bad Neighborhood** | Focus on historically buggy areas |
| **Intellectual** | Test the most complex features |
| **FedEx** | Follow data through the system |
| **Garbage Collector** | Navigate to least-used features |
| **Saboteur** | Try to break things intentionally |

## Session Charter Template
```
CHARTER: Explore [target area]
WITH: [resources/tools/heuristics]
TO DISCOVER: [what we're looking for]
TIME BOX: [45/60/90 minutes]
PRIORITY: [P0/P1/P2]
```
