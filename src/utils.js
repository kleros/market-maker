module.exports = {
  calculateMaximumReserve: function(
    availableEther,
    availablePinakion,
    initialPrice
  ) {
    const etherValueOfAvailablePinakion = availablePinakion.times(initialPrice)
    const isEtherTheLimitingResource = etherValueOfAvailablePinakion.gt(
      availableEther
    )
      ? true
      : false

    if (isEtherTheLimitingResource)
      return {
        ether: availableEther,
        pinakion: availableEther.div(initialPrice)
      }
    else
      return {
        ether: availablePinakion.times(initialPrice),
        pinakion: availablePinakion
      }
  }
}
