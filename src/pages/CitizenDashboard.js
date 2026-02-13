import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import '../styles/Dashboard.css';

function CitizenDashboard() {
  const [issues, setIssues] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    fetchUserIssues();
  }, [token, navigate]);

  const fetchUserIssues = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/issues/user/my-issues`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setIssues(response.data.data);
    } catch (err) {
      setError('Failed to fetch issues');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleReportNewIssue = () => {
    navigate('/report-issue');
  };

  return (
    <div className="citizen-dashboard">
      <header className="dashboard-header">
        <h1>Welcome, {user.name}!</h1>
        <div className="header-actions">
          <button className="btn-report" onClick={handleReportNewIssue}>
            Report New Issue
          </button>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      <div className="issues-section">
        <h2>Your Reported Issues</h2>
        <p className="info-text">Note: Only work progress changes made by admins are updated here</p>

        {loading ? (
          <p>Loading issues...</p>
        ) : issues.length === 0 ? (
          <p>You haven't reported any issues yet. <a href="/report-issue">Report one now</a></p>
        ) : (
          <div className="issues-list">
{issues.map((issue) => (
  <div key={issue._id} className="issue-card">
    <div className="issue-header">
      <h3>{issue.issueType}</h3>
      <span className={`status-badge ${issue.status}`}>
        {issue.status}
      </span>
    </div>

    {/* 🔥 IMAGE DISPLAY ADDED HERE */}
    {issue.image && (
      <img
        src={`${API_BASE_URL}/uploads/${issue.image}`}
        alt="Issue"
        style={{
          width: "250px",
          height: "180px",
          objectFit: "cover",
          borderRadius: "8px",
          marginBottom: "10px",
          border: "1px solid #ccc"
        }}
      />
    )}

    <p><strong>Description:</strong> {issue.description}</p>
    <p><strong>Location:</strong> {issue.location.streetName}, {issue.location.city}</p>
    <p><strong>Reported on:</strong> {new Date(issue.createdAt).toLocaleDateString()}</p>

    {issue.comments && (
      <p><strong>Admin Comments:</strong> {issue.comments}</p>
    )}

    {issue.resolutionDate && (
      <p><strong>Resolved on:</strong> {new Date(issue.resolutionDate).toLocaleDateString()}</p>
    )}
  </div>
))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CitizenDashboard;
