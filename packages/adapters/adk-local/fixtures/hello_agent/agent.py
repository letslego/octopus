"""Minimal Google ADK 2.x agent package for Paperclip adk_local smoke tests.

Compatible with the ADK 2 Workflow Runtime (Agent subclasses BaseNode).
"""

from google.adk import Agent

root_agent = Agent(
    name="hello_agent",
    model="gemini-2.5-flash",
    instruction=(
        "You are a Paperclip-managed Google ADK 2.x agent. "
        "Reply briefly and confirm you are running under the ADK runtime."
    ),
)
