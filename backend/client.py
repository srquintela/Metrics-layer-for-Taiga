import requests
import urllib3
import json
import os
import sys
import argparse

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
        "auth_token": "",
        "user_id": 7,
        "project_ids": [40, 16, 15, 14, 26, 11, 35]
    }

def override_with_env(config):
    # Allow runtime override using environment variables (used when backend triggers python)
    domain = os.environ.get('TAIGA_DOMAIN')
    token = os.environ.get('AUTH_TOKEN')
    user_id = os.environ.get('USER_ID')
    if domain:
        config['taiga_domain'] = domain
    if token:
        config['auth_token'] = token
    if user_id:
        try:
            config['user_id'] = int(user_id)
        except Exception:
            config['user_id'] = user_id
    return config

def fetch_and_import(target_project_id=None):
    config = load_config()
    config = override_with_env(config)
    domain = config.get('taiga_domain', 'taiga.bdp.com.bo')
    auth_token = config.get('auth_token')
    
    headers = {}
    if auth_token:
        headers['Authorization'] = f'Bearer {auth_token}'
    
    # We need the user ID for some endpoints, but we can also fetch projects by membership
    # Taiga's /api/v1/projects?member=... needs an ID. 
    # If we don't have it, we might need to fetch userInfo first.
    
    user_id = config.get('user_id')
    if not user_id:
        print("Error: user_id missing in config. Please authenticate via the settings page.")
        sys.exit(1)
        
    try:
        print(f"Fetching user info from {domain} (ID: {user_id})...")
        user_url = f"https://{domain}/api/v1/users/{user_id}"
        user_res = requests.get(user_url, headers=headers, verify=False, timeout=10)
        
        if user_res.status_code in [401, 403]:
            print(f"Error: Authentication failed (Status {user_res.status_code}). Token might be expired.")
            sys.exit(1)
            
        user_res.raise_for_status()
        user_info = user_res.json()
        print(f"Running for user: {user_info.get('full_name', 'Unknown')} (ID: {user_id})")
    except sys.exit:
        raise
    except Exception as e:
        print(f"Warning: Could not fetch user info: {e}. Proceeding with dynamic project discovery...")

    all_stories = []
    project_names = {}
    project_ids = []

    try:
        if target_project_id:
            print(f"Targeting specific project (ID: {target_project_id})...")
            p_url = f"https://{domain}/api/v1/projects/{target_project_id}"
            p_res = requests.get(p_url, headers=headers, verify=False, timeout=10)
            p_res.raise_for_status()
            p_data = p_res.json()
            project_ids = [int(target_project_id)]
            project_names = {int(target_project_id): p_data['name']}
        else:
            # Fetch projects where the user is a member
            print(f"Fetching projects for user membership (ID: {user_id})...")
            projects_url = f"https://{domain}/api/v1/projects?member={user_id}"
            projects_res = requests.get(projects_url, headers=headers, verify=False, timeout=15)
            
            if projects_res.status_code in [401, 403]:
                print(f"Error: Authentication failed when fetching projects (Status {projects_res.status_code}).")
                sys.exit(1)
                
            projects_res.raise_for_status()
            projects_data = projects_res.json()
            
            for p in projects_data:
                project_ids.append(p['id'])
                project_names[p['id']] = p['name']
        
        if not project_ids:
            print(f"No projects found or specified project {target_project_id} not available.")
            return
            
        print(f"Discovered/Targeted {len(project_ids)} projects: {list(project_names.values())}")
        
    except sys.exit:
        raise
    except Exception as e:
        print(f"Error initializing projects: {e}")
        sys.exit(1)

    for project_id in project_ids:
        if project_id not in project_names:
            continue
            
        # Fetch status names for mapping
        status_map = {}
        try:
            status_url = f"https://{domain}/api/v1/userstory-statuses?project={project_id}"
            status_res = requests.get(status_url, headers=headers, verify=False, timeout=10)
            status_res.raise_for_status()
            for s in status_res.json():
                status_map[s['id']] = s['name']
        except Exception as e:
            print(f"  Warning: Could not fetch statuses for project {project_id}: {e}")

        # Fetch members for mapping
        member_map = {}
        try:
            member_url = f"https://{domain}/api/v1/memberships?project={project_id}"
            member_res = requests.get(member_url, headers=headers, verify=False, timeout=10)
            member_res.raise_for_status()
            for m in member_res.json():
                member_map[m['user']] = m['full_name'] or m['user_display_name'] or m['username']
        except Exception as e:
            print(f"  Warning: Could not fetch members for project {project_id}: {e}")

        # Fetch task statuses for mapping
        task_status_map = {}
        try:
            ts_url = f"https://{domain}/api/v1/task-statuses?project={project_id}"
            ts_res = requests.get(ts_url, headers=headers, verify=False, timeout=10)
            ts_res.raise_for_status()
            for ts in ts_res.json():
                task_status_map[ts['id']] = ts['name']
        except Exception as e:
            print(f"  Warning: Could not fetch task statuses for project {project_id}: {e}")

        # Fetch all tasks for the project (to map to stories later)
        all_project_tasks = []
        t_page = 1
        print(f"  Fetching tasks for project {project_id}...")
        while True:
            t_url = f"https://{domain}/api/v1/tasks?project={project_id}&page={t_page}"
            try:
                t_res = requests.get(t_url, headers=headers, verify=False, timeout=20)
                t_res.raise_for_status()
                tasks_batch = t_res.json()
                if not tasks_batch:
                    break
                
                for task in tasks_batch:
                    if task.get('status') in task_status_map:
                        task['status_name'] = task_status_map[task['status']]
                    
                    if task.get('assigned_to') in member_map:
                        task['assigned_to_name'] = member_map[task['assigned_to']]
                    else:
                        task['assigned_to_name'] = 'Sin Asignar'
                    # If the task has a finished_date, mark it so we can easily
                    # count finished tasks later when attaching them to stories.
                    if task.get('finished_date'):
                        task['is_finished'] = True
                        # Ensure there's a status_name that frontend will treat as done
                        # use a canonical name so client-side detection works reliably
                        task['status_name'] = task.get('status_name') or 'Finalizado'

                    all_project_tasks.append(task)
                
                t_page += 1
            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 404 and t_page > 1:
                    break
                print(f"  Error fetching tasks for project {project_id} on page {t_page}: {e}")
                break
            except Exception as e:
                print(f"  Error fetching tasks for project {project_id} on page {t_page}: {e}")
                break
        
        print(f"  Found {len(all_project_tasks)} tasks.")

        # Fetch milestones for mapping
        milestone_map = {}
        try:
            milestone_url = f"https://{domain}/api/v1/milestones?project={project_id}"
            milestone_res = requests.get(milestone_url, headers=headers, verify=False, timeout=10)
            milestone_res.raise_for_status()
            for ms in milestone_res.json():
                milestone_map[ms['id']] = ms
        except Exception as e:
            print(f"  Warning: Could not fetch milestones for project {project_id}: {e}")

        page = 1
        project_stories = []
        print(f"Fetching user stories from project {project_names[project_id]} (ID: {project_id})")
        
        while True:
            url = f"https://{domain}/api/v1/userstories?project={project_id}&include_assigned_to_extra=true&include_status_extra=true&include_extra_info=true&page={page}"
            
            try:
                # Fetch user stories for the specific page
                response = requests.get(url, headers=headers, verify=False, timeout=20) 
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

                    milestone_obj = milestone_map.get(story.get('milestone'))
                    if milestone_obj:
                        story['sprint_name'] = milestone_obj['name']
                        story['sprint_start'] = milestone_obj.get('estimated_start')
                        story['sprint_end'] = milestone_obj.get('estimated_finish')
                    else:
                        story['sprint_name'] = 'Sin Sprint'
                    
                    # Inject related tasks
                    story_tasks = [t for t in all_project_tasks if t.get('user_story') == story['id']]
                    story['tasks'] = story_tasks
                    # Provide quick counts for total and finished tasks so the
                    # frontend can render burndowns/metrics directly without
                    # parsing task finished_date values.
                    story['tasks_total_count'] = len(story_tasks)
                    story['tasks_done_count'] = sum(1 for t in story_tasks if t.get('finished_date') or t.get('is_finished'))

                project_stories.extend(stories)
                page += 1
                
            except requests.exceptions.HTTPError as e:
                # Taiga returns 404 when there are no more pages
                if e.response.status_code == 404 and page > 1:
                    break
                print(f"  Error fetching stories for project {project_id} on page {page}: {e}")
                break
            except Exception as e:
                print(f"  Error fetching stories for project {project_id} on page {page}: {e}")
                break
        
        print(f"Completed project {project_names[project_id]}: Total {len(project_stories)} stories.")
        all_stories.extend(project_stories)

    if not all_stories:
        print("!!! WARNING: No stories fetched from any project. Skipping import. !!!")
        print("Check if auth_token is still valid and projects contain user stories.")
        sys.exit(1)
    
    print(f"DEBUG: Successfully aggregated {len(all_stories)} stories for import.")

    # Send (import) data to the local Express server
    try:
        local_server_url = "http://localhost:3000/import"
        print(f"Importing {len(all_stories)} total stories to: {local_server_url}")
        
        # We'll send the data with a type flag so the server knows it's user stories
        payload = {
            "type": "userstories",
            "data": all_stories
        }
        
        import_response = requests.post(local_server_url, json=payload, timeout=10)
        import_response.raise_for_status()
        
        print("Import successful!")
        print("Server response:", import_response.json())

    except Exception as e:
        print(f"An error occurred during import: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Taiga Data Sync')
    parser.add_argument('--project', help='Specific Project ID to sync')
    args = parser.parse_args()
    
    fetch_and_import(target_project_id=args.project)
