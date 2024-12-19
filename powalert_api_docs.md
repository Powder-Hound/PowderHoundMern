

---

# **API Documentation**

## **Overview**
This API enables access to user management, resort data, and authentication functionalities for your application. It includes endpoints for CRUD operations, user authentication, and additional query-based searches.

---

## **Base URL**

```
http://<your-server-domain>/api
```

---

# **Endpoints**

## **1. Authentication Endpoints**

### **1.1 User Signup**
- **URL**: `/auth/signup`
- **Method**: `POST`
- **Description**: Creates a new user account.

**Request Body**:
```json
{
  "name": "string",
  "email": "string",
  "password": "string",
  "phoneNumber": "string"
}
```

**Response**:
- Success: `201 Created`
```json
{
  "success": true,
  "user": { "name": "John Doe", "email": "john@example.com" },
  "token": "JWT_TOKEN"
}
```
- Error: `500 Internal Server Error`

---

### **1.2 User Login**
- **URL**: `/auth/login`
- **Method**: `POST`
- **Description**: Logs in an existing user.

**Request Body**:
```json
{
  "phoneNumber": "string",
  "code": "string"
}
```

**Response**:
- Success: `200 OK`
```json
{
  "success": true,
  "message": "Login successful",
  "token": "JWT_TOKEN",
  "user": { "name": "John Doe", "email": "john@example.com" }
}
```
- Error: `404 Not Found | 500 Internal Server Error`

---

### **1.3 Validate Username**
- **URL**: `/auth/validate-username`
- **Method**: `POST`
- **Description**: Checks if a username already exists.

**Request Body**:
```json
{
  "username": "string"
}
```

**Response**:
- Success: `200 OK`
```json
{ "success": true }
```
- Error: `400 Username already exists`

---

## **2. User Endpoints**

### **2.1 Get User**
- **URL**: `/users/:id`
- **Method**: `GET`
- **Auth**: Requires JWT token
- **Description**: Retrieves a specific user's details.

**Response**:
- Success: `200 OK`
```json
{
  "success": true,
  "data": { "name": "John Doe", "email": "john@example.com" }
}
```
- Error: `401 Unauthorized | 500 Internal Server Error`

---

### **2.2 Delete User**
- **URL**: `/users/:id`
- **Method**: `DELETE`
- **Auth**: Requires JWT token
- **Description**: Deletes a specific user.

**Response**:
- Success: `200 OK`
```json
{ "success": true, "data": {} }
```
- Error: `401 Unauthorized | 500 Internal Server Error`

---

### **2.3 Update Alert Threshold**
- **URL**: `/users/alertThreshold`
- **Method**: `PUT`
- **Auth**: Requires JWT token
- **Description**: Updates a user's alert threshold preferences.

**Request Body**:
```json
{
  "alertThreshold": {
    "preferredResorts": ["string"],
    "anyResort": true
  }
}
```

**Response**:
- Success: `200 OK`
```json
{ "success": true, "data": { "preferredResorts": ["string"] } }
```

---

## **3. Resort Endpoints**

### **3.1 Create Resort**
- **URL**: `/resorts/create`
- **Method**: `POST`
- **Auth**: Requires JWT token with "admin" permission
- **Description**: Creates a new resort.

**Request Body**:
```json
{
  "Ski Resort Name": "string",
  "State": "string"
}
```

**Response**:
- Success: `201 Created`
```json
{ "success": true, "data": { "Ski Resort Name": "Sample Resort" } }
```
- Error: `500 Internal Server Error | 401 Unauthorized`

---

### **3.2 Get Resort by ID**
- **URL**: `/resorts/id/:id`
- **Method**: `GET`
- **Auth**: Requires JWT token
- **Description**: Retrieves a specific resort.

**Response**:
- Success: `200 OK`
```json
{ "success": true, "data": { "Ski Resort Name": "Sample Resort" } }
```
- Error: `404 Not Found | 500 Internal Server Error`

---

### **3.3 Get All Resorts**
- **URL**: `/resorts`
- **Method**: `GET`
- **Description**: Retrieves a paginated list of resorts.

**Query Parameters**:
- `page` (optional): Current page number.
- `pageSize` (optional): Number of resorts per page.

**Response**:
- Success: `200 OK`
```json
{
  "success": true,
  "resorts": {
    "metadata": { "totalCount": 100, "page": 1, "pageSize": 25, "hasNextPage": true },
    "data": [{ "Ski Resort Name": "Sample Resort" }]
  }
}
```

---

### **3.4 Find Resort**
- **URL**: `/resorts/find`
- **Method**: `GET`
- **Description**: Finds resorts based on `state`, `name`, or `id`.

**Query Parameters**:
- `state` (optional)
- `name` (optional)
- `id` (optional)

**Response**:
- Success: `200 OK`
```json
{ "success": true, "data": [{ "Ski Resort Name": "Sample Resort" }] }
```

---

### **3.5 Find List of Resorts**
- **URL**: `/resorts/list`
- **Method**: `GET`
- **Description**: Retrieves resorts by multiple IDs.

**Query Parameters**:
- `ids` (comma-separated)

**Response**:
- Success: `200 OK`
```json
{ "success": true, "data": [{ "Ski Resort Name": "Sample Resort" }] }
```

---

### **3.6 Update Resort**
- **URL**: `/resorts/:id`
- **Method**: `PUT`
- **Auth**: Requires JWT token with "admin" permission
- **Description**: Updates a specific resort.

**Request Body**:
```json
{ "Ski Resort Name": "Updated Resort Name" }
```

**Response**:
- Success: `200 OK`
```json
{ "success": true, "data": { "Ski Resort Name": "Updated Resort Name" } }
```

---

### **3.7 Delete Resort**
- **URL**: `/resorts/:id`
- **Method**: `DELETE`
- **Auth**: Requires JWT token with "admin" permission
- **Description**: Deletes a specific resort.

**Response**:
- Success: `200 OK`
```json
{ "success": true, "data": {} }
```

---

## **Error Responses**

- **401 Unauthorized**: Missing or invalid authentication token.
- **404 Not Found**: Resource does not exist.
- **500 Internal Server Error**: Server encountered an issue.

---

## **Authentication**
- Use the `Authorization` header with the JWT token.
```
Authorization: Bearer <JWT_TOKEN>
```

---

## **Notes**
- Admin permissions are required for creating, updating, and deleting resorts.
- Pagination for `getAllResorts` supports page and pageSize query parameters.

