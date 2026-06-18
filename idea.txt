Overall

Create a website builder for small businesses that can be reused across industries. 

- A client will provide an issue they are having, along with pain points, certain wants, needs.
- The creator will help to generate a list of features to tackle these pain points and provide extra features
- The creator will create requirements for each feature, including the business rules, assumptions, solution
- The creator will then create a visual design prototype based on the requirements for each feature, being clear about when each feature should be developed and which ones depend on each other
- The creator can then create a website solution with specific properties of front end framework, database, API contacts and other technologies provided by the user.

Agents

- Main agent that creates tasks, assigns them, promotes peer-review and reviews tasks to put them into final review. Agent will create tasks and connect this to a jira board in order to assign to the appropriate member where necessary
- BA Agent specific to creating the product requirements and turning the personas or initial requirements into product requirements and features
    - Another agent that reviews and critiques these requirements and argues with the other agent to ensure a proper specification is created
    - Once created, notifies the main agent so that it can create the tasks based on the feature
- 2 Design Agents specific to creation of designs for each feature that is listed and created by the BA agent. They review each other’s work to ensure that the designs match the correct requirements as well as that it contains good design principles
- 3 Code Agents that code each feature. Each agent will spin up their own branch, build and create unit tests. Once completed, the code is pushed and the task is updated to be in-review. This notifies all agents (coding, BA, design) to review the features. Once reviewed it gets placed into final review for the developer to review before moving to done
    - Other dev agents will check the code for maintainability and ensure it meets security, accessibility aspects
    - BA and design review the output of the code by running through playwright to check that the features created are what is expected
    - The 3 dev agents will check the ready for dev queue for new tasks or returning tasks
- QA agent tests the feature when the task moves to ready for test (after the final review is completed). This talks to the BA agent when it has questions around the requirements
    - If the test passes, moves the task into ready for deployment
    - If the test fails, moves the task back to ready for dev with a tag that specifies that it has come back as failed and lists the fail in the task comments
- 

Features

- Requirements generator that turns an idea or a persona into a practical set of requirements, that are feature driven
- Design system that generates large scale designs based on requirements and contains all interactions, models, and states for each page
- Code builder that asks for initial setup information (web base, hosting platform, database) and builds according to specification of design and requirements
- Test creation and automatic playwright UI testing of each feature
- Large skill base that contains
    - Basic do’s and dont’s for the platform (e.g. always ensure the requirements and the design is adhered to)
    - The guidelines for website development
        - Coding guidelines
        - Security guidelines
        - Accessibility guidelines
- AI agent team or roles that allow it to work and notify each other, as well as review work

Tasks

- Create a Product requirements document template that each idea should be generated against. The AI should ask questions to then correctly build out this, and prompt the user to answer each part that is missing
    - Features
        - Main feature
        - Problem alignment (missing feature today)
        - Timing and priority
        - Background evidence
        - Target users
            - Benefit of feature to end user
        - Ux design principles
        - Scope (in scope and out of scope)
            - AI should clarify specifically what is in scope and what is out of scope
        - User stories
        - Supporting documents
        - Release milestone and plan
        - User clarifications/questions
        - Assumptions
    - Establish two agents, one that creates the product requirements and another that reviews and critiques it
    - Agents will need to come to an understanding together for it to be completed
- Create a template for design system that provides how the designs will be generated based on the PRD
    - User flows/wireframes/interactive prototype
        - All flows should be accessible in some way and can always be exited (go back) using something on the screen
    - WCAG guideliens
        - Contrast
        - Keyboard accessibility
    - Responsiveness - breakpoints for screen sizing
    - Interactions with each clickable element
        - Every element that is clickable or selectable needs to have clear rules for what it does and what is affected on the screen when it is selected
    - Text length and what should happen if the text extends the viable space
    - States of different business rules (different screen showing for different states)
        - A home page for someone with multiple houses may be different to one that has no houses, or just one house. The landing pages may differ based on business rules
    - Overall States
        - Error handling and framework. Failed API calls or failed to load pages should have separate error states and screens provided.
        - Loading states and generic loading frameworks
            - Page loading states
            - Specific component loading state
            - File upload loading
        - Success states
            - Banners for successful completion
            - Completed successfully screens (at the end of form submissions)
        - Empty states
            - Text labels of placeholders for fields
            - No data available (e.g. Table of data that has no fields returned when filtered)
        - Validation states
            - For forms, validation messages when user incorrectly enters information
            - Error messages
        - Edit states
            - If a dropdown, are the choices displayed sorted? Are long options contain ellipses, is there a search option
            - Autocomplete options
        - Interaction states
            - Readonly state
            - Disabled state
            - Active state
            - Focus state
    - Figma generation
        - Correct layer naming
        - Generate SVGs instead of png or jpg
        - Only stick to what can be implemtned using CSS
    - Design system
        - Tokens
        - Colours (ask for branding colours)
        - Components