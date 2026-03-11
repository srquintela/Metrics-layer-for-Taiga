import requests
import urllib3
import json
import os

# Disable SSL warnings for the POC
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def load_config():
    config_path = os.path.join(os.path.dirname(__file__), 'config.json')
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            return json.load(f)
    return {
        "taiga_domain": "taiga.bdp.com.bo",
        "username": "",
        "auth_token": ""
    }

def fetch_and_import():
    config = load_config()
    domain = config.get('taiga_domain', 'taiga.bdp.com.bo')
    auth_token = config.get('auth_token')
    
    headers = {}
    if auth_token:
        headers['Authorization'] = f'Bearer {auth_token}'
    
    # We need the user ID for some endpoints, but we can also fetch projects by membership
    # Taiga's /api/v1/projects?member=... needs an ID. 
    # If we don't have it, we might need to fetch userInfo first.
    
    user_id = None
    try:
        print(f"Fetching user info from {domain}...")
        user_url = f"https://{domain}/api/v1/users/me"
        user_res = requests.get(user_url, headers=headers, verify=False)
        user_res.raise_for_status()
        user_info = user_res.json()
        user_id = user_info['id']
        print(f"Authenticated as {user_info['full_name']} (ID: {user_id})")
    except Exception as e:
        print(f"Warning: Could not fetch user info: {e}. Attempting to proceed...")

    projects_url = f"https://{domain}/api/v1/projects"
    if user_id:
        projects_url += f"?member={user_id}"
        
    all_stories = []
    
    try:
        print(f"Fetching projects: {projects_url}")
        proj_response = requests.get(projects_url, headers=headers, verify=False)
        proj_response.raise_for_status()
        projects = proj_response.json()
        
        project_ids = [p['id'] for p in projects]
        project_names = {p['id']: p['name'] for p in projects}
        print(f"Discovered {len(project_ids)} projects: {list(project_names.values())}")
        
    except Exception as e:
        print(f"Error fetching projects: {e}")
        return

    for project_id in project_ids:
        # Fetch status names for mapping
        status_map = {}
        try:
            status_url = f"https://{domain}/api/v1/userstory-statuses?project={project_id}"
            status_res = requests.get(status_url, headers=headers, verify=False)
            status_res.raise_for_status()
            for s in status_res.json():
                status_map[s['id']] = s['name']
        except Exception as e:
            print(f"  Warning: Could not fetch statuses for project {project_id}: {e}")

        # Fetch members for mapping
        member_map = {}
        try:
            member_url = f"https://{domain}/api/v1/memberships?project={project_id}"
            member_res = requests.get(member_url, headers=headers, verify=False)
            member_res.raise_for_status()
            for m in member_res.json():
                member_map[m['user']] = m['full_name'] or m['user_display_name'] or m['username']
        except Exception as e:
            print(f"  Warning: Could not fetch members for project {project_id}: {e}")

        page = 1
        project_stories = []
        print(f"Fetching user stories from project {project_names[project_id]} (ID: {project_id})")
        
        while True:
            url = f"https://{domain}/api/v1/userstories?project={project_id}&include_assigned_to_extra=true&include_status_extra=true&include_extra_info=true&page={page}"
            
            try:
                # Fetch user stories for the specific page
                response = requests.get(url, headers=headers, verify=False) 
                response.raise_for_status()
                stories = response.json()
                
                if not stories:
                    break
                    
                print(f"  Page {page}: Successfully fetched {len(stories)} stories.")
                
                # Inject mapped names
                for story in stories:
                    story['project_name'] = project_names[project_id]
                    story['project'] = project_names[project_id]
                    
                    # Manual mapping injection
                    if story.get('status') in status_map:
                        story['status_name'] = status_map[story['status']]
                    
                    if story.get('assigned_to') in member_map:
                        story['assigned_to_name'] = member_map[story['assigned_to']]

                project_stories.extend(stories)
                page += 1
                
            except Exception as e:
                print(f"  Error fetching stories for project {project_id} on page {page}: {e}")
                break
        
        print(f"Completed project {project_names[project_id]}: Total {len(project_stories)} stories.")
        all_stories.extend(project_stories)

    if not all_stories:
        print("No stories fetched. Skipping import.")
        return

    # Send (import) data to the local Express server
    try:
        local_server_url = "http://localhost:3000/import"
        print(f"Importing {len(all_stories)} total stories to: {local_server_url}")
        
        # We'll send the data with a type flag so the server knows it's user stories
        payload = {
            "type": "userstories",
            "data": all_stories
        }
        
        import_response = requests.post(local_server_url, json=payload)
        import_response.raise_for_status()
        
        print("Import successful!")
        print("Server response:", import_response.json())

    except Exception as e:
        print(f"An error occurred during import: {e}")

if __name__ == "__main__":
    fetch_and_import()
