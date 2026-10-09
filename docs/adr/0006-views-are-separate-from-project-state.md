# Views are separate from project state; Pipeline ships first

Project state, stints and attention items live in one view-independent layer. Views (Pipeline, Lists, Cockpit) only read from it and send actions to it. The UI prototype (tag `prototype-ui-v1`) built all three views on one store, and the developer chose Pipeline as the primary view while keeping Lists and Cockpit for later. This separation is what lets later views ship without touching the core.
