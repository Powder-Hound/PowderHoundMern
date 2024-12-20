export const checkResorts = async () => {
  const mockUsers = [
    {
      _id: "user1",
      username: "JohnDoe",
      resortPreference: { resorts: ["resort1", "resort8"] }, // Include all resorts
      alertThreshold: {
        preferredResorts: 10,
        anyResort: 20,
        snowfallPeriod: 24,
        uom: "cm",
      },
      notificationsActive: { phone: true, email: false },
      phoneNumber: "123456789",
      email: "john@example.com",
    },
  ];

  const mockResortData = {
    resort1: {
      region: "Northeast",
      source1: {
        uom: "cm",
        forecast: [{ validTime: "2024-06-14T00:00:00Z", value: 12 }],
      },
    },
    resort8: {
      region: "Alaska",
      source1: {
        uom: "cm",
        forecast: [{ validTime: "2024-06-14T00:00:00Z", value: 25 }],
      },
    },
  };

  const usersToNotify = {};

  mockUsers.forEach((user) => {
    const resortsMetThreshold = [];
    user.resortPreference.resorts.forEach((resort) => {
      const value = mockResortData[resort]?.source1.forecast[0].value || 0;
      if (value >= user.alertThreshold.preferredResorts) {
        resortsMetThreshold.push(resort);
      }
    });

    if (resortsMetThreshold.length) {
      usersToNotify[user._id] = {
        username: user.username,
        resorts: { preferredResorts: resortsMetThreshold },
      };
    }
  });

  return usersToNotify;
};
